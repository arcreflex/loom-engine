import {
  type Node,
  type NodeData,
  type NodeId,
  type RootId,
  type RootConfig,
  type Message,
  type RootData,
  type NodeMetadata,
  getToolCalls
} from './types.ts';
import { normalizeMessage } from './content-blocks.ts';
import { normalizeForComparison, stableDeepEqual } from './engine-utils.ts';
import type { ILoomStore, NodeStructure } from './store/types.ts';
import { SerialQueue } from './queue.ts';
import type { ConfigStore } from './config.ts';

export class Forest {
  private queue = new SerialQueue();

  private store: ILoomStore;
  private configStore?: ConfigStore;

  constructor(store: ILoomStore, configStore?: ConfigStore) {
    this.store = store;
    this.configStore = configStore;
  }

  async serialize() {
    const allNodes = await this.store.listAllNodeStructures();
    const nodesById: { [id: NodeId]: NodeStructure } = {};
    for (const n of allNodes) {
      nodesById[n.id] = n;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: any = {};
    const roots = await this.listRoots();
    // DFS to serialize the tree structure
    for (const root of roots) {
      out[root.id] = await this.serializeNode(root.id);
    }
    return out;
  }

  private async serializeNode(nodeId: NodeId) {
    const node = await this.store.loadNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serialized: any = {
      id: node.id,
      role: node.parent_id ? node.message.role : 'system',
      message:
        node.parent_id !== undefined
          ? {
              role: node.message.role,
              content: node.message.content
            }
          : node.config.systemPrompt,
      children: {}
    };
    for (const childId of node.child_ids) {
      serialized.children[childId] = await this.serializeNode(childId);
    }
    return serialized;
  }

  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(fn);
  }

  async getOrCreateRoot(systemPrompt?: string): Promise<RootData> {
    return this.enqueue(async () => {
      const config: RootConfig = { systemPrompt };
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

  async listRoots(): Promise<RootData[]> {
    return (await this.store.listRootInfos()).filter(root => !root.deleted);
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

  async getSiblings(nodeId: NodeId): Promise<NodeData[]> {
    // Get the node
    const node = await this.store.loadNode(nodeId);
    if (!node || !node.parent_id) {
      return []; // Node doesn't exist or has no parent
    }

    // Get the parent
    const parentNode = await this.store.loadNode(node.parent_id);
    if (!parentNode) {
      return []; // Parent doesn't exist
    }

    const all = await this.getChildren(parentNode.id);
    return all.filter(child => child.id !== nodeId);
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
    return this.enqueue(async () =>
      this.appendUnsafe(parentId, messages, metadata)
    );
  }

  private async appendUnsafe(
    parentId: NodeId,
    messages: Message[],
    metadata: Omit<NodeMetadata, 'timestamp' | 'original_root_id'>
  ): Promise<Node> {
    const parentNode = await this.store.loadNode(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found: ${parentId}`);
    }

    messages = messages.filter(m => {
      const toolCalls = getToolCalls(m)?.length ?? 0;
      const contentUnknown = (m as unknown as { content?: unknown }).content;
      if (typeof contentUnknown === 'string') {
        return contentUnknown.trim().length > 0 || toolCalls > 0;
      }
      if (Array.isArray(contentUnknown)) {
        // Treat as V2 ContentBlock[]
        const hasToolUse = contentUnknown.some(
          b => (b as { type?: string }).type === 'tool-use'
        );
        const hasText = contentUnknown.some(b => {
          const blk = b as { type?: string; text?: unknown };
          return (
            blk.type === 'text' &&
            typeof blk.text === 'string' &&
            blk.text.trim().length > 0
          );
        });
        // Allow assistant messages that are tool-use only; drop if empty after normalization
        return hasText || hasToolUse;
      }
      // null/undefined: only keep if tool calls are present
      return toolCalls > 0;
    });

    if (!messages.length) {
      return parentNode;
    }

    // Start with the parent node and first message index
    let currentParentId: NodeId = parentId;
    let messageIndex = 0;

    // Implement prefix matching
    while (true) {
      if (messageIndex >= messages.length) {
        const nodeAtParent = await this.store.loadNode(currentParentId);
        if (!nodeAtParent) {
          throw new Error(`Current parent node not found: ${currentParentId}`);
        }
        return nodeAtParent;
      }
      // Get children of current parent
      const children = await this.getChildren(currentParentId);

      // Skip messages that normalize to empty for comparison
      const currentMessage = messages[messageIndex];
      const normalizedCurrent = normalizeForComparison(
        normalizeMessage(currentMessage)
      );
      if (!normalizedCurrent) {
        messageIndex++;
        continue;
      }

      // Look for a child that matches the current message (V2-normalized, deep equality)
      const matchingChild = children.find(child => {
        const normalizedChild = normalizeForComparison(
          normalizeMessage(child.message)
        );
        return (
          !!normalizedChild &&
          stableDeepEqual(normalizedChild, normalizedCurrent)
        );
      });

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
  }

  /**
   * Splits a node at a specified position in the text, creating a new node with the content after the split point.
   * The original node will contain content up to the split point, and the new node will contain
   * content after it. Children of the original node will be reparented to the new node.
   *
   * @returns The node representing messages up to the split point
   */
  async splitNode(nodeId: NodeId, position: number): Promise<NodeData> {
    return this.enqueue(async () => this.splitNodeUnsafe(nodeId, position));
  }

  private async splitNodeUnsafe(
    nodeId: NodeId,
    position: number
  ): Promise<NodeData> {
    // Get the node to split
    const node = await this.store.loadNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    if (!node.parent_id) {
      throw new Error(`Cannot split root node: ${nodeId}`);
    }

    // Validate the message has content and position is valid
    if (node.message.content == null) {
      throw new Error(`Cannot split node with null content: ${nodeId}`);
    }
    if (position <= 0 || position >= node.message.content.length) {
      throw new Error(
        `Invalid message index for split: ${position}. Must be between 1 and ${node.message.content.length - 1}`
      );
    }

    if (node.message.role === 'tool') {
      throw new Error(`Cannot split tool message: ${nodeId}`);
    }

    const left = node.message.content.slice(0, position);
    const right = node.message.content.slice(position);

    // Create a new node to hold the messages up to the split point
    const timestamp = new Date().toISOString();
    const lhsNode: NodeData = {
      id: this.store.generateNodeId(node.root_id),
      root_id: node.root_id,
      parent_id: node.parent_id, // Same parent as the original node
      child_ids: [node.id], // Original node, which will now be the right-hand node, is the only child of the left-hand node
      message: {
        role: node.message.role,
        content: left
      },
      metadata: {
        timestamp,
        original_root_id: node.metadata.original_root_id,
        tags: node.metadata.tags ? [...node.metadata.tags] : undefined,
        custom_data: node.metadata.custom_data
          ? { ...node.metadata.custom_data }
          : undefined,
        source_info: { ...node.metadata.source_info },
        split_source: node.id
      }
    };

    // Reparent the original node to the new left-hand node
    const originalParentId = node.parent_id;
    node.message.content = right;
    node.parent_id = lhsNode.id;

    // Update original parent's child_ids
    const parentNode = await this.store.loadNode(originalParentId);
    if (!parentNode) {
      throw new Error(`Parent node not found: ${originalParentId}`);
    }
    parentNode.child_ids = parentNode.child_ids.filter(
      id => id !== nodeId // Remove the original node from parent's children
    );
    parentNode.child_ids.push(lhsNode.id); // Add the new left-hand node as a child

    await this.store.saveNode(parentNode);
    await this.store.saveNode(lhsNode);
    await this.store.saveNode(node);
    return lhsNode;
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

  async deleteNodes(nodeIds: NodeId[]) {
    return this.enqueue(async () => {
      for (const nodeId of nodeIds) {
        await this.deleteNodeUnsafe(nodeId, false);
      }
    });
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
    const parentNode = await this.store.loadNode(node.parent_id);
    if (!parentNode) {
      throw new Error(`Parent node not found: ${node.parent_id}`);
    }

    if (reparentToGrandparent) {
      const parentChildren = parentNode.child_ids.filter(id => id !== nodeId);
      for (const childId of node.child_ids) {
        parentChildren.push(childId);
        const childNode = await this.store.loadNode(childId);
        if (childNode) {
          childNode.parent_id = node.parent_id;
          await this.store.saveNode(childNode);
        }
      }
      parentNode.child_ids = parentChildren;
    } else {
      const descendants = await this.findAllDescendants(node);
      for (const id of descendants) {
        await this.store.deleteNode(id);
      }
      // Clean up bookmarks for all deleted descendants
      await this.cleanupBookmarks(descendants);
      parentNode.child_ids = parentNode.child_ids.filter(id => id !== nodeId);
    }
    await this.store.saveNode(parentNode);

    await this.store.deleteNode(nodeId);

    // Clean up bookmark for the deleted node itself
    await this.cleanupBookmarks([nodeId]);

    return parentNode;
  }

  async findAllDescendants(node: Node): Promise<NodeId[]> {
    const descendants: NodeId[] = [];
    for (const childId of node.child_ids) {
      descendants.push(childId);
      const childNode = await this.store.loadNode(childId);
      if (childNode) {
        const childDescendants = await this.findAllDescendants(childNode);
        descendants.push(...childDescendants);
      }
    }
    return descendants;
  }

  /**
   * Removes bookmarks that reference the given node IDs
   */
  private async cleanupBookmarks(nodeIds: NodeId[]): Promise<void> {
    if (!this.configStore) {
      return; // No config store available, skip bookmark cleanup
    }

    const config = this.configStore.get();
    const bookmarks = config.bookmarks || [];

    // Filter out bookmarks that reference deleted nodes
    const remainingBookmarks = bookmarks.filter(
      bookmark => !nodeIds.includes(bookmark.nodeId)
    );

    // Only update if there are bookmarks to remove
    if (remainingBookmarks.length !== bookmarks.length) {
      await this.configStore.update({ bookmarks: remainingBookmarks });
    }
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

  /**
   * Edits the content of a node.
   * If the node has no children, it's edited in-place.
   * If the node has children, this creates a new branch by finding the
   * longest common prefix, splitting the original node, and appending the
   * new content.
   * @param nodeId The ID of the node to edit.
   * @param newContent The new text content for the message.
   * @returns The final node representing the result of the edit.
   */
  async editNodeContent(nodeId: NodeId, newContent: string): Promise<NodeData> {
    return this.enqueue(async () => {
      const nodeToEdit = await this.store.loadNode(nodeId);
      if (!nodeToEdit || !nodeToEdit.parent_id) {
        throw new Error(`Node not found or is a root: ${nodeId}`);
      }

      const originalContent = nodeToEdit.message.content || '';

      // Simple case: No children. Edit in place.
      if (nodeToEdit.child_ids.length === 0) {
        nodeToEdit.message.content = newContent;
        // Mark this edit's source.
        nodeToEdit.metadata.source_info = { type: 'user' };
        await this.store.saveNode(nodeToEdit);
        return nodeToEdit as NodeData;
      }

      // Complex case: Node has children. Create a new branch.
      // 1. Find the longest common prefix.
      let lcpLength = 0;
      while (
        lcpLength < originalContent.length &&
        lcpLength < newContent.length &&
        originalContent[lcpLength] === newContent[lcpLength]
      ) {
        lcpLength++;
      }

      let baseNode: Node = nodeToEdit;

      // 2. If the original node needs to be split (i.e., the edit doesn't share the full original content as a prefix).
      if (lcpLength === 0) {
        // If there's no common prefix, just append to the parent
        const parent = await this.getNode(nodeToEdit.parent_id);
        if (!parent) {
          throw new Error(`Parent node not found: ${nodeToEdit.parent_id}`);
        }
        baseNode = parent;
      } else if (lcpLength < originalContent.length) {
        // splitNode returns the truncated original node.
        baseNode = await this.splitNodeUnsafe(nodeId, lcpLength);
      }

      // 3. Append the remainder of the new content.
      const newSuffix = newContent.slice(lcpLength);
      if (newSuffix.length > 0) {
        const newMessage: Message = {
          ...nodeToEdit.message,
          content: newSuffix
        };
        // `append` will create a new node for the suffix.
        return (await this.appendUnsafe(baseNode.id, [newMessage], {
          source_info: { type: 'user' }
        })) as NodeData;
      } else {
        // If there's no new suffix, the new content was a prefix of the old.
        // The (potentially split) baseNode is our final destination.
        return baseNode as NodeData;
      }
    });
  }

  /**
   * Gets the structural information of all nodes across all roots.
   * @returns An array of node structures suitable for graph visualization
   */
  async getAllNodeStructures() {
    return this.store.listAllNodeStructures();
  }
}
