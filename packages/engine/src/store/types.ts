import type { NodeId, RootId, RootData, Node, NodeData } from '../types.ts';

/**
 * Criteria for querying nodes in the store.
 */
export interface NodeQueryCriteria {
  /** Filter by parent ID. */
  parentId?: NodeId;

  /** Filter by root ID. */
  rootId?: RootId;
}

/**
 * Interface for a storage system that persists loom data.
 */
export interface ILoomStore {
  /**
   * Initializes the store with a base directory path.
   * @param basePath - The directory where loom data will be stored
   */
  initialize: (basePath: string) => Promise<void>;

  /**
   * Saves a node to the store.
   * @param nodeData - The node data to save
   */
  saveNode: (nodeData: Node) => Promise<void>;

  /**
   * Loads a node from the store by its ID.
   * @param nodeId - The ID of the node to load
   * @returns The node data, or null if not found
   */
  loadNode: (nodeId: NodeId) => Promise<Node | null>;

  /**
   * Deletes a node from the store.
   * @param nodeId - The ID of the node to delete
   */
  deleteNode: (nodeId: NodeId) => Promise<void>;

  /**
   * Finds nodes matching certain criteria.
   * @param criteria - The criteria to match
   * @returns An array of matching node data
   */
  findNodes: (criteria: NodeQueryCriteria) => Promise<NodeData[]>;

  /**
   * Saves root information to the store.
   * @param rootInfo - The root information to save
   */
  saveRootInfo: (rootInfo: RootData) => Promise<void>;

  /**
   * Loads root information from the store.
   * @param rootId - The ID of the root to load
   * @returns The root information, or null if not found
   */
  loadRootInfo: (rootId: RootId) => Promise<RootData | null>;

  /**
   * Lists all root information stored in the system.
   * @returns An array of root information
   */
  listRootInfos: () => Promise<RootData[]>;

  log(msg: unknown): void;
}
