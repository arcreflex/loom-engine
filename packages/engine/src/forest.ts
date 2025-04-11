import type {
  Node,
  NodeData,
  NodeId,
  RootId,
  RootConfig,
  Message,
  RootData,
  NodeMetadata
} from './types.ts';
import type { ILoomStore } from './store/types.ts';
import { SerialQueue } from './queue.ts';

export class Forest {
  private queue = new SerialQueue();

  private store: ILoomStore;
  constructor(store: ILoomStore) {
    this.store = store;
  }

  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(fn);
  }

  async getOrCreateRoot(config: RootConfig): Promise<RootData> {
    return this.enqueue(async () => {
      const roots = await this.listRoots();
      const existingRoot = roots.find(
        root => JSON.stringify(root.config) === JSON.stringify(config)
      );
      if (existingRoot) {
        return existingRoot;
      }

      const rootId = this.store.generateRootId();
      const timestamp = new Date().toISOString();

      // Create root info
      const rootInfo: RootData = {
        id: rootId,
        createdAt: timestamp,
        config,
        child_ids: []
      };

      // Save root info
      await this.store.saveRootInfo(rootInfo);
      return rootInfo;
    });
  }

  async getRoot(rootId: RootId): Promise<RootData | null> {
    return this.store.loadRootInfo(rootId);
  }

  private async listRoots(): Promise<RootData[]> {
    return this.store.listRootInfos();
  }

  /**
   * Gets a node by its ID.
   * @param nodeId - The ID of the node to get
   * @returns The node data, or null if not found
   */
  async getNode(nodeId: NodeId): Promise<Node | null> {
    return await this.store.loadNode(nodeId);
  }

  /**
   * Gets all messages in the path from root to the specified node.
   */
  async getMessages(
    nodeId: NodeId
  ): Promise<{ root: RootData; messages: Message[] }> {
    const { root, path } = await this.getPath({ from: undefined, to: nodeId });
    return { root, messages: path.map(n => n.message) };
  }

  async getPath({
    from,
    to
  }: {
    /** Starting node (inclusive), or undefined for the root. */
    from: NodeId | undefined;
    /** Ending node (inclusive) */
    to: NodeId;
  }): Promise<{ root: RootData; path: NodeData[] }> {
    const nodes: NodeData[] = [];
    let currentNodeId: NodeId | undefined = to;
    let root: RootData | null = null;

    const seen = new Set<NodeId>();

    // Traverse up from nodeId to root, collecting nodes
    while (currentNodeId) {
      const node = await this.store.loadNode(currentNodeId);
      if (!node) {
        throw new Error(`Node not found: ${currentNodeId}`);
      }
      if (seen.has(node.id)) {
        throw new Error(`Circular reference detected: ${node.id}`);
      }
      seen.add(node.id);
      if (!root) {
        root =
          node.parent_id === undefined
            ? node
            : await this.store.loadRootInfo(node.root_id);
      }

      if (node.parent_id) {
        nodes.unshift(node); // Add to beginning of array
      }
      if (currentNodeId === from) break;
      currentNodeId = node.parent_id;
    }

    if (from && currentNodeId !== from) {
      throw new Error(`Path does not include starting node: ${from}`);
    }

    if (!root) {
      throw new Error(`Root info not found: ${to}`);
    }

    return {
      root: root,
      path: nodes
    };
  }

  /**
   * Gets the children of a node.
   * @param nodeId - The ID of the node to get children for
   * @returns An array of child node data
   */
  async getChildren(nodeId: NodeId): Promise<NodeData[]> {
    const node = await this.store.loadNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const rootId = node.parent_id !== undefined ? node.root_id : node.id;
    return this.store.findNodes({ parentId: node.id, rootId });
  }

  /**
   * Appends messages to a node, with prefix matching.
   * @returns The final node created or matched
   */
  async append(
    parentId: NodeId,
    /** The node id at which to start matching. */
    messages: Message[],
    /** The metadata to attach if we create a node */
    metadata: Omit<NodeMetadata, 'timestamp' | 'original_root_id'>
  ): Promise<Node> {
    return this.enqueue(async (): Promise<Node> => {
      const parentNode = await this.store.loadNode(parentId);
      if (!parentNode) {
        throw new Error(`Parent node not found: ${parentId}`);
      }

      if (!messages.length) {
        return parentNode;
      }

      // Start with the parent node and first message index
      let currentParentId: NodeId = parentId;
      let messageIndex = 0;

      // Implement prefix matching
      while (true) {
        // Get children of current parent
        const children = await this.getChildren(currentParentId);

        // Look for a child that matches the current message
        const currentMessage = messages[messageIndex];
        const matchingChild = children.find(
          child =>
            child.message.role === currentMessage.role &&
            child.message.content === currentMessage.content
        );

        if (matchingChild) {
          // Found a match, move to the next message and continue with this child as the new parent
          currentParentId = matchingChild.id;
          messageIndex++;
          if (messageIndex >= messages.length) {
            // All messages matched, return the current child node
            return matchingChild;
          }
        } else {
          // No match found, create new nodes for remaining messages
          break;
        }
      }

      // Create new nodes for the remaining messages
      const timestamp = new Date().toISOString();
      const remainingMessages = messages.slice(messageIndex);
      let head = await this.store.loadNode(currentParentId);
      if (!head) {
        throw new Error(`Current parent node not found: ${currentParentId}`);
      }
      const root_id = head.parent_id === undefined ? head.id : head.root_id;

      for (const message of remainingMessages) {
        const newNode: NodeData = {
          id: this.store.generateNodeId(root_id),
          root_id,
          parent_id: head.id,
          child_ids: [],
          message,
          metadata: {
            timestamp,
            original_root_id: root_id,
            ...metadata
          }
        };

        // Update parent's child_ids
        head.child_ids.push(newNode.id);
        await this.store.saveNode(head);

        // Save the new node
        await this.store.saveNode(newNode);
        head = newNode;
      }

      return head;
    });
  }

  /**
   * Splits a node at a specified position in the text, creating a new node with the content after the split point.
   * The original node will contain content up to the split point, and the new node will contain
   * content after it. Children of the original node will be reparented to the new node.
   *
   * @returns The original node (now containing only messages before the split)
   */
  async splitNode(nodeId: NodeId, position: number): Promise<NodeData> {
    return this.enqueue(async () => {
      // Get the node to split
      const node = await this.store.loadNode(nodeId);
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }
      if (!node.parent_id) {
        throw new Error(`Cannot split root node: ${nodeId}`);
      }

      // Validate the message index
      if (position <= 0 || position >= node.message.content.length) {
        throw new Error(
          `Invalid message index for split: ${position}. Must be between 1 and ${node.message.content.length - 1}`
        );
      }

      const left = node.message.content.slice(0, position);
      const right = node.message.content.slice(position);

      // Create a new node to hold the messages after the split point
      const timestamp = new Date().toISOString();
      const newNode: NodeData = {
        id: this.store.generateNodeId(node.root_id),
        root_id: node.root_id,
        parent_id: node.parent_id, // Same parent as the original node
        child_ids: [...node.child_ids], // Take all the children from the original node
        message: {
          role: node.message.role,
          content: right
        },
        metadata: {
          timestamp,
          original_root_id: node.metadata.original_root_id,
          tags: node.metadata.tags ? [...node.metadata.tags] : undefined,
          custom_data: node.metadata.custom_data
            ? { ...node.metadata.custom_data }
            : undefined,
          source_info: { ...node.metadata.source_info }
        }
      };

      node.message = {
        role: node.message.role,
        content: left
      };
      node.child_ids = [newNode.id]; // Original node now has only new node as child
      node.metadata.source_info = { type: 'split' };

      // Update all children of the original node to point to the new node as their parent
      for (const childId of newNode.child_ids) {
        const child = await this.store.loadNode(childId);
        if (child) {
          child.parent_id = newNode.id;
          await this.store.saveNode(child);
        }
      }

      // Save the new node
      await this.store.saveNode(newNode);

      // Save the modified original node
      await this.store.saveNode(node);

      return node;
    });
  }

  /**
   * Deletes a node from the store.
   * If the node has children, they will be orphaned unless reparentToGrandparent is true.
   *
   * @param nodeId - The ID of the node to delete
   * @param reparentToGrandparent - If true, reparent any children to this node's parent
   * @returns The parent node if it exists, or null
   */
  async deleteNode(nodeId: NodeId, reparentToGrandparent = false) {
    return this.enqueue(() =>
      this.deleteNodeUnsafe(nodeId, reparentToGrandparent)
    );
  }

  private async deleteNodeUnsafe(
    nodeId: NodeId,
    reparentToGrandparent: boolean
  ): Promise<Node | null> {
    // Get the node to delete
    const node = await this.store.loadNode(nodeId);
    if (!node) {
      return null; // Node doesn't exist, nothing to delete
    }

    if (!node.parent_id) {
      throw new Error(
        `Cannot delete root node: ${nodeId}. Use deleteRoot instead.`
      );
    }

    // Get the parent node if it exists
    const parentNode = node.parent_id
      ? await this.store.loadNode(node.parent_id)
      : null;

    if (reparentToGrandparent && parentNode && node.child_ids.length > 0) {
      // Update the parent node to include the children of the node being deleted
      parentNode.child_ids = parentNode.child_ids
        .filter(id => id !== nodeId) // Remove the node being deleted
        .concat(node.child_ids); // Add its children

      // Update all children to point to the grandparent
      for (const childId of node.child_ids) {
        const childNode = await this.store.loadNode(childId);
        if (childNode) {
          childNode.parent_id = node.parent_id;
          await this.store.saveNode(childNode);
        }
      }

      // Save the updated parent
      await this.store.saveNode(parentNode);
    } else if (parentNode) {
      // Just remove the node from its parent's child list
      parentNode.child_ids = parentNode.child_ids.filter(id => id !== nodeId);
      await this.store.saveNode(parentNode);
    }

    // Delete the node from the store
    await this.store.deleteNode(nodeId);

    return parentNode;
  }

  /**
   * Deletes all sibling nodes of the given node (nodes with the same parent).
   *
   * @param nodeId - The ID of the node whose siblings should be deleted
   * @returns The parent node with updated child_ids, or null if the node doesn't exist
   */
  async deleteSiblings(nodeId: NodeId): Promise<Node | null> {
    return this.enqueue(async () => {
      // Get the node
      const node = await this.store.loadNode(nodeId);
      if (!node || !node.parent_id) {
        return null; // Node doesn't exist or has no parent
      }

      // Get the parent
      const parentNode = await this.store.loadNode(node.parent_id);
      if (!parentNode) {
        return null; // Parent doesn't exist
      }

      // Find all siblings (all children of the parent except this node)
      const siblings = parentNode.child_ids.filter(id => id !== nodeId);

      // Delete each sibling
      for (const siblingId of siblings) {
        await this.deleteNodeUnsafe(siblingId, false);
      }

      // Update parent's child_ids to contain only this node
      parentNode.child_ids = [nodeId];
      await this.store.saveNode(parentNode);

      return parentNode;
    });
  }

  /**
   * Deletes all children of the given node.
   *
   * @param nodeId - The ID of the node whose children should be deleted
   * @returns The node with updated child_ids, or null if the node doesn't exist
   */
  async deleteChildren(nodeId: NodeId): Promise<Node | null> {
    return this.enqueue(async () => {
      // Get the node
      const node = await this.store.loadNode(nodeId);
      if (!node) {
        return null; // Node doesn't exist
      }

      // Delete each child
      for (const childId of node.child_ids) {
        await this.deleteNodeUnsafe(childId, false);
      }

      // Update the node's child_ids to be empty
      node.child_ids = [];
      await this.store.saveNode(node);

      return node;
    });
  }

  async updateNodeMetadata(
    nodeId: NodeId,
    metadata: NodeData['metadata']
  ): Promise<void> {
    return this.enqueue(async () => {
      const existingNode = await this.store.loadNode(nodeId);
      if (!existingNode?.parent_id) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Update the node in the store
      await this.store.saveNode({
        ...existingNode,
        metadata
      });
    });
  }
}
