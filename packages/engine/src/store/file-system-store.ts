import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { NodeData, NodeId, RootId, RootData, Node } from '../types.ts';
import type { ILoomStore, NodeQueryCriteria } from './types.ts';
import { initializeLog, log } from '../log.ts';

class IdCache<T extends string> {
  known = new Set<T>();
  private lastId = 0;
  private prefix: string;
  private physicallyExists: (id: T) => boolean;

  constructor(prefix: string, physicallyExists: (id: T) => boolean) {
    this.prefix = prefix;
    this.physicallyExists = physicallyExists;
  }

  next() {
    while (true) {
      const candidate = `${this.prefix}-${++this.lastId}` as T;
      if (this.known.has(candidate)) {
        continue;
      }
      this.known.add(candidate);
      if (!this.physicallyExists(candidate)) {
        return candidate;
      }
    }
  }
}

/**
 * Implements ILoomStore using the filesystem for persistence.
 * Directory structure:
 * - basePath/roots.json: List of all root information
 * - basePath/<rootId>/: Directory for each tree
 * - basePath/<rootId>/nodes/: Directory containing node files
 * - basePath/<rootId>/nodes/<nodeId>.json: JSON file for each node
 */
export class FileSystemStore implements ILoomStore {
  private basePath: string = '';
  private rootsFilePath: string = '';

  private idCaches: {
    root: IdCache<RootId>;
    node: Map<RootId, IdCache<NodeId>>;
  };

  private constructor(basePath: string) {
    this.basePath = basePath;
    this.idCaches = {
      root: new IdCache<RootId>('root', (id: RootId) =>
        existsSync(this.rootDirPath(id))
      ),
      node: new Map<RootId, IdCache<NodeId>>()
    };
    this.rootsFilePath = path.join(basePath, 'roots.json');
  }

  static async create(basePath: string): Promise<FileSystemStore> {
    // Ensure base directory exists
    await fs.mkdir(basePath, { recursive: true });
    initializeLog(basePath);
    const store = new FileSystemStore(basePath);
    // Create roots.json if it doesn't exist
    try {
      await fs.access(store.rootsFilePath);
    } catch {
      await fs.writeFile(store.rootsFilePath, JSON.stringify([]));
    }

    return store;
  }

  generateNodeId(root: RootId): NodeId {
    let cache = this.idCaches.node.get(root);
    if (!cache) {
      cache = new IdCache<NodeId>('node', id =>
        existsSync(this.nodeFilePath(root, id))
      );
      this.idCaches.node.set(root, cache);
    }
    const next = cache.next();
    this.log(`Generated node ID: ${next}`);
    return next;
  }

  generateRootId(): RootId {
    return this.idCaches.root.next();
  }

  /**
   * Saves a node to the store.
   * @param nodeData - The node data to save
   */
  async saveNode(nodeData: Node): Promise<void> {
    if (nodeData.parent_id === undefined) {
      this.saveRootInfo(nodeData);
      return;
    }

    const nodesDir = this.nodesDirPath(nodeData.root_id);
    const nodePath = this.nodeFilePath(nodeData.root_id, nodeData.id);

    // Ensure directories exist
    await fs.mkdir(nodesDir, { recursive: true });

    // Write node data
    await fs.writeFile(nodePath, JSON.stringify(nodeData, null, 2));
  }

  private rootDirPath(rootId: RootId) {
    return path.join(this.basePath, rootId);
  }

  private nodesDirPath(rootId: RootId) {
    return path.join(this.basePath, rootId, 'nodes');
  }

  private nodeFilePath(rootId: RootId, nodeId: NodeId) {
    return path.join(this.nodesDirPath(rootId), `${nodeId}.json`);
  }

  /**
   * Loads a node from the store by its ID.
   * @param nodeId - The ID of the node to load
   * @returns The node data, or null if not found
   */
  async loadNode(nodeId: NodeId): Promise<Node | null> {
    // Since we don't know the root ID, we need to search through all roots
    const roots = await this.listRootInfos();

    for (const root of roots) {
      if (root.id === nodeId) {
        return root;
      }

      const nodePath = this.nodeFilePath(root.id, nodeId);

      try {
        const data = await fs.readFile(nodePath, 'utf-8');
        return JSON.parse(data) as NodeData;
      } catch (_error) {
        // Node not found in this root, continue to next root
        continue;
      }
    }

    return null;
  }

  /**
   * Deletes a node from the store.
   * @param nodeId - The ID of the node to delete
   */
  async deleteNode(nodeId: NodeId): Promise<void> {
    // Find the node first to get its root_id
    const node = await this.loadNode(nodeId);
    if (!node) {
      return;
    }

    if (node.parent_id === undefined) {
      throw new Error('Cannot delete root node');
    }

    const nodePath = this.nodeFilePath(node.root_id, nodeId);
    await fs.unlink(nodePath);
  }

  /**
   * Finds nodes matching certain criteria.
   * @param criteria - The criteria to match
   * @returns An array of matching node data
   */
  async findNodes(criteria: NodeQueryCriteria): Promise<NodeData[]> {
    const { parentId, rootId } = criteria;

    if (!rootId) {
      throw new Error('rootId is required for findNodes');
    }

    const nodesDir = this.nodesDirPath(rootId);

    try {
      // Get all node files
      const files = await fs.readdir(nodesDir);

      const nodes: NodeData[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const nodePath = path.join(nodesDir, file);
        const data = await fs.readFile(nodePath, 'utf-8');
        const node = JSON.parse(data) as NodeData;

        // Filter by parent ID if specified
        if (parentId && node.parent_id !== parentId) {
          continue;
        }

        nodes.push(node);
      }

      return nodes;
    } catch (_error) {
      // If directory doesn't exist or other error, return empty array
      return [];
    }
  }

  /**
   * Saves root information to the store.
   * @param rootInfo - The root information to save
   */
  async saveRootInfo(rootInfo: RootData): Promise<void> {
    // Create root directory
    const rootDir = this.rootDirPath(rootInfo.id);
    await fs.mkdir(rootDir, { recursive: true });

    // Update roots.json
    const roots = await this.listRootInfos();

    const existingIndex = roots.findIndex(r => r.id === rootInfo.id);
    if (existingIndex >= 0) {
      roots[existingIndex] = rootInfo;
    } else {
      roots.push(rootInfo);
    }

    await fs.writeFile(this.rootsFilePath, JSON.stringify(roots, null, 2));
  }

  /**
   * Loads root information from the store.
   * @param rootId - The ID of the root to load
   * @returns The root information, or null if not found
   */
  async loadRootInfo(rootId: RootId): Promise<RootData | null> {
    const roots = await this.listRootInfos();
    return roots.find(r => r.id === rootId) || null;
  }

  /**
   * Lists all root information stored in the system.
   * @returns An array of root information
   */
  async listRootInfos(): Promise<RootData[]> {
    try {
      const data = await fs.readFile(this.rootsFilePath, 'utf-8');
      return JSON.parse(data) as RootData[];
    } catch (_error) {
      // If file doesn't exist or is invalid, return empty array
      return [];
    }
  }

  log(msg: unknown) {
    log(this.basePath, msg);
  }
}
