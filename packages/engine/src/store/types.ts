import type {
  NodeId,
  RootId,
  RootData,
  Node,
  NodeData,
  NodeDataV2,
  Role
} from '../types.ts';

/**
 * Represents the minimal structure of a node for graph visualization.
 */
export interface NodeStructure {
  id: NodeId;
  parent_id: NodeId | null; // Use null for roots
  child_ids: NodeId[];
  root_id: RootId;
  timestamp: string;
  role: Role | 'system'; // Include role for styling
}

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
  generateNodeId: (root: RootId) => NodeId;
  generateRootId: () => RootId;

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

  /**
   * Lists the structure of all nodes across all roots, excluding content.
   * @returns An array of NodeStructure objects
   */
  listAllNodeStructures: () => Promise<NodeStructure[]>;

  /**
   * Loads a node from the store by its ID and normalizes its message to V2 format.
   * Only accepts node IDs, not root IDs.
   * @param nodeId - The ID of the node to load (must be a node, not a root)
   * @returns The node data with V2 message format, or null if not found
   * @throws {Error} if nodeId refers to a root, or if message normalization fails
   * @experimental This method is part of the V2 message format migration.
   *               Currently only implemented by FileSystemStore.
   */
  loadNodeNormalized: (nodeId: NodeId) => Promise<NodeDataV2 | null>;

  /**
   * Finds nodes matching criteria and normalizes their messages to V2 format.
   * @param criteria - The criteria to match
   * @returns An array of matching node data with V2 message format
   * @throws {Error} if any message normalization fails (indicates corrupted data)
   * @experimental This method is part of the V2 message format migration.
   *               Currently only implemented by FileSystemStore.
   */
  findNodesNormalized: (criteria: NodeQueryCriteria) => Promise<NodeDataV2[]>;

  log(msg: unknown): void;
}
