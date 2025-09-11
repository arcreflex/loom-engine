import type {
  NodeId,
  RootId,
  RootData,
  Node,
  NodeData,
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
   * Loads a node and strictly validates/normalizes its message (blocks format).
   * Only accepts node IDs, not root IDs.
   * @param nodeId - The ID of the node to load (must be a node, not a root)
   * @returns The node data with canonical message format, or null if not found
   * @throws {Error} if nodeId refers to a root, or if message normalization fails
   */
  loadNodeStrict: (nodeId: NodeId) => Promise<NodeData | null>;

  /**
   * Finds nodes matching criteria and strictly validates/normalizes their messages.
   * @param criteria - The criteria to match
   * @returns An array of matching node data
   * @throws {Error} if any message normalization fails (indicates corrupted data)
   */
  findNodesStrict: (criteria: NodeQueryCriteria) => Promise<NodeData[]>;

  log(msg: unknown): void;
}
