import fs from 'fs/promises';
import path from 'path';
import type { NodeData, NodeId, RootId, RootData, Node } from '../types.ts';
import type { ILoomStore, NodeQueryCriteria } from './types.ts';

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

  /**
   * Initializes the store with a base directory path.
   * @param basePath - The directory where loom data will be stored
   */
  async initialize(basePath: string): Promise<void> {
    this.basePath = basePath;
    this.rootsFilePath = path.join(basePath, 'roots.json');

    // Ensure base directory exists
    await fs.mkdir(basePath, { recursive: true });

    // Create roots.json if it doesn't exist
    try {
      await fs.access(this.rootsFilePath);
    } catch {
      await fs.writeFile(this.rootsFilePath, JSON.stringify([]));
    }
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

    const rootDir = path.join(this.basePath, nodeData.root_id);
    const nodesDir = path.join(rootDir, 'nodes');
    const nodePath = path.join(nodesDir, `${nodeData.id}.json`);

    // Ensure directories exist
    await fs.mkdir(nodesDir, { recursive: true });

    // Write node data
    await fs.writeFile(nodePath, JSON.stringify(nodeData, null, 2));
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

      const nodePath = path.join(
        this.basePath,
        root.id,
        'nodes',
        `${nodeId}.json`
      );

      try {
        const data = await fs.readFile(nodePath, 'utf-8');
        return JSON.parse(data) as NodeData;
      } catch (error) {
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

    const nodePath = path.join(
      this.basePath,
      node.root_id,
      'nodes',
      `${nodeId}.json`
    );
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

    const nodesDir = path.join(this.basePath, rootId, 'nodes');

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
    } catch (error) {
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
    const rootDir = path.join(this.basePath, rootInfo.id);
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
    } catch (error) {
      // If file doesn't exist or is invalid, return empty array
      return [];
    }
  }
}
