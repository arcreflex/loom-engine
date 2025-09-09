import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { Forest } from './forest.ts';
import type {
  Node,
  NodeId,
  RootConfig,
  MessageLegacy,
  NodeMetadata
} from './types.ts';
import { createMockStore, mockNodeId, mockRootId } from './test-helpers.ts';

// Create a test message
const createMessage = (
  role: 'user' | 'assistant',
  content: string
): MessageLegacy => ({
  role,
  content
});

describe('Forest', () => {
  let mockStoreWrapper: ReturnType<typeof createMockStore>;
  let forest: Forest;

  beforeEach(() => {
    mockStoreWrapper = createMockStore();
    forest = new Forest(mockStoreWrapper.mockStore);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('getOrCreateRoot', () => {
    it('should return existing root if it exists with identical config', async () => {
      // Setup
      const systemPrompt = 'You are a helpful assistant';
      const config: RootConfig = { systemPrompt };

      const existingRoot = mockStoreWrapper.createTestRoot('root1', config);

      // Execute
      const result = await forest.getOrCreateRoot(systemPrompt);

      // Verify
      assert.deepEqual(result, existingRoot);
      assert.equal(
        mockStoreWrapper.mockStore.listRootInfos.mock.calls.length,
        1
      );
      assert.equal(
        mockStoreWrapper.mockStore.saveRootInfo.mock.calls.length,
        0
      );
    });

    it('should create and return a new root if none exists with identical config', async () => {
      // Setup
      const systemPrompt = 'You are a creative writer';

      // Execute
      const result = await forest.getOrCreateRoot(systemPrompt);

      // Verify
      assert.deepEqual(result.config, { systemPrompt });
      assert.equal(typeof result.id, 'string');
      assert.equal(
        mockStoreWrapper.mockStore.listRootInfos.mock.calls.length,
        1
      );
      assert.equal(
        mockStoreWrapper.mockStore.saveRootInfo.mock.calls.length,
        1
      );
      assert.deepEqual(
        mockStoreWrapper.mockStore.saveRootInfo.mock.calls[0].arguments[0],
        result
      );
    });

    it('should handle undefined systemPrompt', async () => {
      // Execute
      const result = await forest.getOrCreateRoot(undefined);

      // Verify
      assert.deepEqual(result.config, { systemPrompt: undefined });
      assert.equal(typeof result.id, 'string');
    });
  });

  describe('getRoot', () => {
    it('should return root data if it exists', async () => {
      // Setup
      const config: RootConfig = {
        systemPrompt: 'You are a helpful assistant'
      };

      const existingRoot = mockStoreWrapper.createTestRoot('root1', config);

      // Execute
      const result = await forest.getRoot(existingRoot.id);

      // Verify
      assert.deepEqual(result, existingRoot);
      assert.equal(
        mockStoreWrapper.mockStore.loadRootInfo.mock.calls.length,
        1
      );
      assert.equal(
        mockStoreWrapper.mockStore.loadRootInfo.mock.calls[0].arguments[0],
        existingRoot.id
      );
    });

    it('should return null if root does not exist', async () => {
      // Setup
      const nonExistentRootId = mockRootId('nonexistent');

      // Execute
      const result = await forest.getRoot(nonExistentRootId);

      // Verify
      assert.equal(result, null);
      assert.equal(
        mockStoreWrapper.mockStore.loadRootInfo.mock.calls.length,
        1
      );
      assert.equal(
        mockStoreWrapper.mockStore.loadRootInfo.mock.calls[0].arguments[0],
        nonExistentRootId
      );
    });
  });

  describe('getNode', () => {
    it('should return node data if it exists', async () => {
      // Setup
      const node = mockStoreWrapper.createTestNode('node1', 'root1', null, {
        role: 'user',
        content: 'blah'
      });

      // Execute
      const result = await forest.getNode(node.id);

      // Verify
      assert.deepEqual(result, node);
      assert.equal(mockStoreWrapper.mockStore.loadNode.mock.calls.length, 1);
      assert.equal(
        mockStoreWrapper.mockStore.loadNode.mock.calls[0].arguments[0],
        node.id
      );
    });

    it('should return null if node does not exist', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');

      // Execute
      const result = await forest.getNode(nonExistentNodeId);

      // Verify
      assert.equal(result, null);
      assert.equal(mockStoreWrapper.mockStore.loadNode.mock.calls.length, 1);
      assert.equal(
        mockStoreWrapper.mockStore.loadNode.mock.calls[0].arguments[0],
        nonExistentNodeId
      );
    });
  });

  describe('getMessages', () => {
    it('should return all messages in path from root to specified node', async () => {
      // Setup
      const config: RootConfig = {
        systemPrompt: 'You are a helpful assistant'
      };

      const root = mockStoreWrapper.createTestRoot('root1', config);

      const node1 = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'root1',
        createMessage('user', 'Hello')
      );

      const node2 = mockStoreWrapper.createTestNode(
        'node2',
        'root1',
        'node1',
        createMessage('assistant', 'How can I help you?')
      );

      const node3 = mockStoreWrapper.createTestNode(
        'node3',
        'root1',
        'node2',
        createMessage('user', 'Tell me about loom')
      );

      // Update child ids
      root.child_ids.push(node1.id);
      node1.child_ids.push(node2.id);
      node2.child_ids.push(node3.id);

      // Save nodes with updated child ids
      await mockStoreWrapper.mockStore.saveRootInfo(root);
      await mockStoreWrapper.mockStore.saveNode(node1);
      await mockStoreWrapper.mockStore.saveNode(node2);

      // Execute - get messages starting from node3
      const result = await forest.getMessages(node3.id);

      // Verify
      assert.deepEqual(result.root, root);
      assert.deepEqual(result.messages, [
        node1.message,
        node2.message,
        node3.message
      ]);
    });

    it('should throw error if node is not found', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');

      // Execute & Verify
      await assert.rejects(
        async () => await forest.getMessages(nonExistentNodeId),
        {
          name: 'Error',
          message: `Node not found: ${nonExistentNodeId}`
        }
      );
    });
  });

  describe('getChildren', () => {
    it('should return the children of a node', async () => {
      // Setup
      const parentNode = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const child1 = mockStoreWrapper.createTestNode(
        'child1',
        'root1',
        'parent',
        createMessage('assistant', 'Child 1 message')
      );
      const child2 = mockStoreWrapper.createTestNode(
        'child2',
        'root1',
        'parent',
        createMessage('user', 'Child 2 message')
      );

      parentNode.child_ids = [child1.id, child2.id];
      await mockStoreWrapper.mockStore.saveNode(parentNode);

      // Execute
      const result = await forest.getChildren(parentNode.id);

      // Verify
      assert.equal(result.length, 2);
      assert.deepEqual(result[0], child1);
      assert.deepEqual(result[1], child2);
      assert.equal(mockStoreWrapper.mockStore.loadNode.mock.calls.length, 1);
      assert.equal(mockStoreWrapper.mockStore.findNodes.mock.calls.length, 1);
      assert.deepEqual(
        mockStoreWrapper.mockStore.findNodes.mock.calls[0].arguments[0],
        { parentId: parentNode.id, rootId: parentNode.root_id }
      );
    });

    it('should throw error if parent node is not found', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');

      // Execute & Verify
      await assert.rejects(
        async () => await forest.getChildren(nonExistentNodeId),
        {
          name: 'Error',
          message: `Node not found: ${nonExistentNodeId}`
        }
      );
    });
  });

  describe('getSiblings', () => {
    it('should return the siblings of a node', async () => {
      // Setup
      const parentNode = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const sibling1 = mockStoreWrapper.createTestNode(
        'sibling1',
        'root1',
        'parent',
        createMessage('assistant', 'Sibling 1 message')
      );
      const sibling2 = mockStoreWrapper.createTestNode(
        'sibling2',
        'root1',
        'parent',
        createMessage('user', 'Sibling 2 message')
      );
      const targetNode = mockStoreWrapper.createTestNode(
        'target',
        'root1',
        'parent',
        createMessage('user', 'Target node')
      );
      parentNode.child_ids = [sibling1.id, sibling2.id, targetNode.id];
      await mockStoreWrapper.mockStore.saveNode(parentNode);
      await mockStoreWrapper.mockStore.saveNode(sibling1);
      await mockStoreWrapper.mockStore.saveNode(sibling2);
      await mockStoreWrapper.mockStore.saveNode(targetNode);
      // Execute
      const result = await forest.getSiblings(targetNode.id);
      // Verify
      assert.equal(result.length, 2);
      assert.deepEqual(result[0], sibling1);
      assert.deepEqual(result[1], sibling2);
    });
  });

  describe('append', () => {
    it('should append messages to a node', async () => {
      // Setup
      mockStoreWrapper.createTestRoot('root1');
      const firstMessage = createMessage('user', 'First message');
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        firstMessage
      );
      const messages = [
        createMessage('assistant', 'Hello'),
        createMessage('user', 'Hi there!')
      ];
      const metadata: Omit<NodeMetadata, 'timestamp' | 'original_root_id'> = {
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { max_tokens: -1, temperature: 1 }
        },
        tags: ['greeting']
      };

      // Execute
      const result = await forest.append(parent.id, messages, metadata);

      // Verify
      assert.ok(result.parent_id);
      assert.equal(result.root_id, parent.root_id);
      // V2: compare normalized message content
      assert.deepEqual(
        result.message,
        (await import('./content-blocks.ts')).normalizeMessage(
          messages[1] as any
        )
      );
      assert.deepEqual(result.metadata.tags, metadata.tags);

      const norm = (await import('./content-blocks.ts')).normalizeMessage;
      assert.deepEqual((await forest.getMessages(result.id)).messages, [
        norm(firstMessage as any),
        ...messages.map(m => norm(m as any))
      ]);
    });

    it('should just return the parent node if message array is empty', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'hi')
      );

      // Execute & Verify
      const result = await forest.append(parent.id, [], {
        source_info: { type: 'user' }
      });
      assert.deepEqual(
        result,
        parent,
        'Should return the parent node if no messages are appended'
      );
    });

    it('should throw error if parent node does not exist', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');
      const messages = [createMessage('user', 'Hello')];

      // Execute & Verify
      await assert.rejects(
        async () =>
          await forest.append(nonExistentNodeId, messages, {
            source_info: { type: 'user' }
          }),
        {
          name: 'Error',
          message: `Parent node not found: ${nonExistentNodeId}`
        }
      );
    });

    it('should reuse existing nodes with prefix matching', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'hi')
      );
      const existingMessage = createMessage('assistant', 'Hello');
      const existingChild = mockStoreWrapper.createTestNode(
        'existing_child',
        'root1',
        'parent',
        existingMessage
      );

      parent.child_ids = [existingChild.id];
      await mockStoreWrapper.mockStore.saveNode(parent);

      const messagesToAppend = [
        existingMessage, // This matches the existing child's message
        createMessage('assistant', 'How can I help you?') // This is new
      ];

      // Execute
      const result = await forest.append(parent.id, messagesToAppend, {
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { max_tokens: -1, temperature: 1 }
        }
      });

      // Verify
      assert.notEqual(result.id, existingChild.id); // Should be a new node
      assert.equal(result.parent_id, existingChild.id); // Parent should be the existing child
      const norm2 = (await import('./content-blocks.ts')).normalizeMessage;
      assert.deepEqual(result.message, norm2(messagesToAppend[1] as any));
    });

    it('should return existing node if all messages match', async () => {
      // Setup
      const first = createMessage('user', 'first');
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        first
      );
      const existingMessage = createMessage('assistant', 'Blah');
      const existingChild = mockStoreWrapper.createTestNode(
        'existing_child',
        'root1',
        'parent',
        existingMessage,
        {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { max_tokens: -1, temperature: 1 }
        }
      );

      parent.child_ids = [existingChild.id];
      await mockStoreWrapper.mockStore.saveNode(parent);

      // Only include the existing message
      const messagesToAppend = [existingMessage];

      const nodeCount = mockStoreWrapper.nodes.size;

      // Execute
      const result = await forest.append(parent.id, messagesToAppend, {
        source_info: {
          type: 'user'
        }
      });

      // Verify
      assert.strictEqual(
        mockStoreWrapper.nodes.size,
        nodeCount,
        'no new nodes created'
      );
      assert.deepEqual(result, existingChild); // Should be the existing node
    });
  });

  // Test splitNode method
  describe('splitNode', () => {
    it('should split a node at the specified position in the message content', async () => {
      const root = mockStoreWrapper.createTestRoot('root1', {
        systemPrompt: ''
      });
      // Setup - create a node with a single message containing a longer text
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        root.id,
        null,
        createMessage('user', 'Initial prompt')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        root.id,
        'parent',
        createMessage(
          'user',
          'This is a long message that will be split into two parts.'
        )
      );

      // Create a child of the node
      const childNode = mockStoreWrapper.createTestNode(
        'child1',
        root.id,
        'node1',
        createMessage('assistant', 'Child response')
      );

      // Set up the parent-child relationships
      root.child_ids = [parent.id];
      parent.child_ids = [node.id];
      node.child_ids = [childNode.id];

      await mockStoreWrapper.mockStore.saveRootInfo(root);
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(childNode);

      // Position to split at (after "This is a long ")
      const splitPosition = 15;

      // Execute - split the node at the specified position
      const lhsNode = await forest.splitNode(node.id, splitPosition);

      assert.deepEqual(await forest.serialize(), {
        root1: {
          children: {
            parent: {
              children: {
                [lhsNode.id]: {
                  children: {
                    node1: {
                      children: {
                        child1: {
                          children: {},
                          id: 'child1',
                          message: {
                            content: [{ type: 'text', text: 'Child response' }],
                            role: 'assistant'
                          },
                          role: 'assistant'
                        }
                      },
                      id: 'node1',
                      message: {
                        content: [
                          {
                            type: 'text',
                            text: 'message that will be split into two parts.'
                          }
                        ],
                        role: 'user'
                      },
                      role: 'user'
                    }
                  },
                  id: lhsNode.id,
                  message: {
                    content: [{ type: 'text', text: 'This is a long ' }],
                    role: 'user'
                  },
                  role: 'user'
                }
              },
              id: 'parent',
              message: {
                content: [{ type: 'text', text: 'Initial prompt' }],
                role: 'user'
              },
              role: 'user'
            }
          },
          id: 'root1',
          message: '',
          role: 'system'
        }
      });
    });

    it('should mark split node with correct metadata', async () => {
      // Setup
      const root = mockStoreWrapper.createTestRoot('root1', {
        systemPrompt: ''
      });
      const node = mockStoreWrapper.createTestNode(
        'node_with_metadata',
        'root1',
        root.id,
        createMessage('assistant', 'Response with some tags and custom data'),
        {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 0.7, max_tokens: 1 }
        }
      );

      // Add tags and custom data
      node.metadata.tags = ['important', 'reference'];
      node.metadata.custom_data = { note: 'Remember this', priority: 'high' };

      root.child_ids = [node.id];
      await mockStoreWrapper.mockStore.saveRootInfo(root);
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute - split at position 10
      const lhs = await forest.splitNode(node.id, 10);

      // Verify metadata was preserved in new node
      assert.ok(lhs?.parent_id);
      assert.deepEqual(lhs.metadata.tags, ['important', 'reference']);
      assert.deepEqual(lhs.metadata.custom_data, {
        note: 'Remember this',
        priority: 'high'
      });
      assert.deepEqual(lhs.metadata.source_info, {
        type: 'model',
        provider: 'openai',
        model_name: 'gpt-4',
        parameters: { temperature: 0.7, max_tokens: 1 }
      });
      assert.equal(lhs.metadata.split_source, node.id);

      const original = await mockStoreWrapper.mockStore.loadNode(node.id);
      assert.deepEqual(
        original?.parent_id !== undefined && original.metadata,
        node.metadata,
        'Original node metadata should remain unchanged'
      );
    });

    it('should throw error if the node does not exist', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');

      // Execute & Verify
      await assert.rejects(
        async () => await forest.splitNode(nonExistentNodeId, 1),
        {
          name: 'Error',
          message: `Node not found: ${nonExistentNodeId}`
        }
      );
    });

    it('should throw error if position is invalid', async () => {
      // Setup
      const node = mockStoreWrapper.createTestNode(
        'node_to_split',
        'root1',
        null,
        createMessage('user', 'Short message')
      );
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute & Verify - position too low
      await assert.rejects(async () => await forest.splitNode(node.id, 0), {
        name: 'Error',
        message: /Invalid message index for split/
      });

      // Execute & Verify - position too high
      const msgLen = ((node.message.content as any[])[0]?.text as string)
        .length;
      await assert.rejects(
        async () => await forest.splitNode(node.id, msgLen),
        {
          name: 'Error',
          message: /Invalid message index for split/
        }
      );
    });
  });

  // Test deletion methods
  describe('deleteNode', () => {
    it('should delete a node with no children', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'first')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('assistant', 'Test message')
      );

      parent.child_ids = [node.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute
      await forest.deleteNode(node.id);

      // Verify the node was deleted
      const deletedNode = await mockStoreWrapper.mockStore.loadNode(node.id);
      assert.equal(deletedNode, null);

      // Verify parent's child_ids was updated
      const updatedParent = await mockStoreWrapper.mockStore.loadNode(
        parent.id
      );
      assert.equal(updatedParent?.child_ids.length, 0);
    });

    it('should delete a node with children and orphan them by default', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'first')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('assistant', 'second')
      );
      const child1 = mockStoreWrapper.createTestNode(
        'child1',
        'root1',
        'node1',
        createMessage('user', 'third')
      );
      const child2 = mockStoreWrapper.createTestNode(
        'child2',
        'root1',
        'node1',
        createMessage('assistant', 'fourth')
      );

      parent.child_ids = [node.id];
      node.child_ids = [child1.id, child2.id];

      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child1);
      await mockStoreWrapper.mockStore.saveNode(child2);

      // Execute
      await forest.deleteNode(node.id);

      // Verify the node was deleted
      const deletedNode = await mockStoreWrapper.mockStore.loadNode(node.id);
      assert.equal(deletedNode, null);

      // Verify parent's child_ids was updated
      const updatedParent = await mockStoreWrapper.mockStore.loadNode(
        parent.id
      );
      assert.equal(updatedParent?.child_ids.length, 0);
    });

    it('should delete a node and reparent its children when reparentToGrandparent is true', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'first')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('assistant', 'second')
      );
      const child1 = mockStoreWrapper.createTestNode(
        'child1',
        'root1',
        'node1',
        createMessage('assistant', 'third')
      );
      const child2 = mockStoreWrapper.createTestNode(
        'child2',
        'root1',
        'node1',
        createMessage('assistant', 'fourth')
      );

      parent.child_ids = [node.id];
      node.child_ids = [child1.id, child2.id];

      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child1);
      await mockStoreWrapper.mockStore.saveNode(child2);

      // Execute
      await forest.deleteNode(node.id, true);

      // Verify the node was deleted
      const deletedNode = await mockStoreWrapper.mockStore.loadNode(node.id);
      assert.equal(deletedNode, null);

      // Verify parent's child_ids was updated
      const updatedParent = await mockStoreWrapper.mockStore.loadNode(
        parent.id
      );
      assert.equal(updatedParent?.child_ids.length, 2);
      assert.ok(updatedParent?.child_ids.includes(child1.id));
      assert.ok(updatedParent?.child_ids.includes(child2.id));

      // Verify children were reparented
      const updatedChild1 = await mockStoreWrapper.mockStore.loadNode(
        child1.id
      );
      const updatedChild2 = await mockStoreWrapper.mockStore.loadNode(
        child2.id
      );

      assert.equal(updatedChild1?.parent_id, parent.id);
      assert.equal(updatedChild2?.parent_id, parent.id);
    });

    it('should return null if the node does not exist', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');

      // Execute
      const result = await forest.deleteNode(nonExistentNodeId);

      // Verify
      assert.equal(result, null);
    });

    it('should clean up bookmarks when deleting a bookmarked node', async () => {
      // Setup
      const mockConfigStore = {
        get: mock.fn(() => ({
          bookmarks: [
            {
              nodeId: 'node1' as NodeId,
              title: 'Test Bookmark',
              rootId: 'root1' as any,
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z'
            },
            {
              nodeId: 'node2' as NodeId,
              title: 'Another Bookmark',
              rootId: 'root1' as any,
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z'
            }
          ]
        })),
        update: mock.fn()
      };

      // Create forest with configStore
      const forestWithConfig = new Forest(
        mockStoreWrapper.mockStore,
        mockConfigStore as any
      );

      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'first')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('assistant', 'Test message')
      );

      parent.child_ids = [node.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute
      await forestWithConfig.deleteNode(node.id);

      // Verify bookmark cleanup was called
      assert.equal(mockConfigStore.update.mock.calls.length, 1);
      const updateCall = mockConfigStore.update.mock.calls[0];
      assert.deepEqual(updateCall.arguments[0], {
        bookmarks: [
          {
            nodeId: 'node2' as NodeId,
            title: 'Another Bookmark',
            rootId: 'root1' as any,
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z'
          }
        ]
      });
    });

    it('should clean up bookmarks for deleted descendants', async () => {
      // Setup
      let currentBookmarks = [
        {
          nodeId: 'parent' as NodeId,
          title: 'Parent Bookmark',
          rootId: 'root1' as any,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z'
        },
        {
          nodeId: 'child1' as NodeId,
          title: 'Child Bookmark',
          rootId: 'root1' as any,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z'
        },
        {
          nodeId: 'other' as NodeId,
          title: 'Other Bookmark',
          rootId: 'root1' as any,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z'
        }
      ];

      const mockConfigStore = {
        get: mock.fn(() => ({
          bookmarks: currentBookmarks
        })),
        update: mock.fn((updates: any) => {
          if (updates.bookmarks) {
            currentBookmarks = updates.bookmarks;
          }
        })
      };

      // Create forest with configStore
      const forestWithConfig = new Forest(
        mockStoreWrapper.mockStore,
        mockConfigStore as any
      );

      const grandparent = mockStoreWrapper.createTestNode(
        'grandparent',
        'root1',
        null,
        createMessage('user', 'first')
      );
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        'grandparent',
        createMessage('assistant', 'second')
      );
      const child1 = mockStoreWrapper.createTestNode(
        'child1',
        'root1',
        'parent',
        createMessage('user', 'third')
      );

      grandparent.child_ids = [parent.id];
      parent.child_ids = [child1.id];

      await mockStoreWrapper.mockStore.saveNode(grandparent);
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(child1);

      // Execute - delete parent node (will delete descendants by default)
      await forestWithConfig.deleteNode(parent.id);

      // Verify bookmarks for both parent and child were cleaned up
      assert.equal(mockConfigStore.update.mock.calls.length, 2);

      // Verify that only the 'other' bookmark remains
      assert.deepEqual(currentBookmarks, [
        {
          nodeId: 'other' as NodeId,
          title: 'Other Bookmark',
          rootId: 'root1' as any,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z'
        }
      ]);
    });
  });

  // Test editNodeContent method
  describe('editNodeContent', () => {
    it('should edit node content in place when node has no children', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('user', 'Original content')
      );

      parent.child_ids = [node.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute
      const result = await forest.editNodeContent(node.id, 'Edited content');

      // Verify
      assert.equal(result.id, node.id, 'Same node ID returned');
      assert.equal(
        (result.message.content as any[])[0]?.text,
        'Edited content',
        'Content was updated'
      );
      assert.equal(result.message.role, 'user', 'Role preserved');
      assert.deepEqual(
        result.metadata.source_info,
        { type: 'user' },
        'Source info updated'
      );

      // Verify in store
      const storedNode = await mockStoreWrapper.mockStore.loadNode(node.id);
      const content = storedNode?.parent_id
        ? (storedNode.message.content as any[])[0]?.text
        : null;
      assert.equal(content, 'Edited content', 'Content persisted in store');
    });

    it('should create new branch when node has children', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('user', 'Original content')
      );
      const child = mockStoreWrapper.createTestNode(
        'child1',
        'root1',
        'node1',
        createMessage('assistant', 'Child response')
      );

      parent.child_ids = [node.id];
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      const originalNodeCount = mockStoreWrapper.nodes.size;

      // Execute
      const result = await forest.editNodeContent(node.id, 'New content');

      // Verify
      assert.notEqual(result.id, node.id, 'New node created');
      assert.equal(
        (result.message.content as any[])[0]?.text,
        'New content',
        'New content applied'
      );
      assert.equal(result.message.role, 'user', 'Role preserved');
      assert.deepEqual(
        result.metadata.source_info,
        { type: 'user' },
        'Source info set'
      );

      // Verify new node was created
      assert.equal(
        mockStoreWrapper.nodes.size,
        originalNodeCount + 1,
        'One new node created'
      );
    });

    it('should handle prefix matching when editing with children', async () => {
      // Setup
      const root = mockStoreWrapper.createTestRoot('root1', {
        systemPrompt: ''
      });
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        root.id,
        null,
        createMessage('user', 'Parent node')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        root.id,
        'parent',
        createMessage('user', 'Original message content')
      );
      const child = mockStoreWrapper.createTestNode(
        'child1',
        root.id,
        'node1',
        createMessage('assistant', 'Child response')
      );

      root.child_ids = [parent.id];
      parent.child_ids = [node.id];
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveRootInfo(root);
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      // Execute - edit with content that shares prefix with original
      const editedNode = await forest.editNodeContent(
        node.id,
        'Original message with new ending'
      );

      const splitParentId = editedNode.parent_id;

      assert.deepEqual(await forest.serialize(), {
        root1: {
          id: 'root1',
          role: 'system',
          message: '',
          children: {
            parent: {
              id: 'parent',
              role: 'user',
              message: {
                role: 'user',
                content: [{ type: 'text', text: 'Parent node' }]
              },
              children: {
                [splitParentId]: {
                  id: splitParentId,
                  role: 'user',
                  message: {
                    role: 'user',
                    content: [{ type: 'text', text: 'Original message ' }]
                  },
                  children: {
                    node1: {
                      id: 'node1',
                      role: 'user',
                      message: {
                        role: 'user',
                        content: [{ type: 'text', text: 'content' }]
                      },
                      children: {
                        child1: {
                          id: 'child1',
                          role: 'assistant',
                          message: {
                            role: 'assistant',
                            content: [{ type: 'text', text: 'Child response' }]
                          },
                          children: {}
                        }
                      }
                    },
                    [editedNode.id]: {
                      id: editedNode.id,
                      role: 'user',
                      message: {
                        role: 'user',
                        content: [{ type: 'text', text: 'with new ending' }]
                      },
                      children: {}
                    }
                  }
                }
              }
            }
          }
        }
      });
    });

    it('should return existing node when new content is prefix of original', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('user', 'Original message content')
      );
      const child = mockStoreWrapper.createTestNode(
        'child1',
        'root1',
        'node1',
        createMessage('assistant', 'Child response')
      );

      parent.child_ids = [node.id];
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      const originalNodeCount = mockStoreWrapper.nodes.size;

      // Execute - edit with content that is a prefix of original
      const result = await forest.editNodeContent(node.id, 'Original message');

      // Verify - should split and return the split node
      assert.notEqual(result.id, node.id, 'Split node returned');
      const splitText = (result.message.content as any[])[0]?.text;
      assert.equal(splitText, 'Original message', 'Content matches prefix');
      assert.equal(
        mockStoreWrapper.nodes.size,
        originalNodeCount + 1,
        'One new node created from split'
      );
    });

    it('should throw error when editing non-existent node', async () => {
      // Setup
      const nonExistentNodeId = mockNodeId('nonexistent');

      // Execute & Verify
      await assert.rejects(
        async () =>
          await forest.editNodeContent(nonExistentNodeId, 'New content'),
        {
          name: 'Error',
          message: `Node not found or is a root: ${nonExistentNodeId}`
        }
      );
    });

    it('should throw error when editing root node', async () => {
      // Setup
      const root = mockStoreWrapper.createTestRoot('root1');

      // Execute & Verify
      await assert.rejects(
        async () => await forest.editNodeContent(root.id, 'New content'),
        {
          name: 'Error',
          message: `Node not found or is a root: ${root.id}`
        }
      );
    });

    it('should reject empty content edit under V2 constraints', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('user', 'Original content')
      );

      parent.child_ids = [node.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute & Verify: V2 disallows empty text blocks; should throw
      await assert.rejects(
        async () => await forest.editNodeContent(node.id, '')
      );
    });

    it('should handle editing with same content', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const node = mockStoreWrapper.createTestNode(
        'node1',
        'root1',
        'parent',
        createMessage('user', 'Same content')
      );

      parent.child_ids = [node.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(node);

      const originalNodeCount = mockStoreWrapper.nodes.size;

      // Execute
      const result = await forest.editNodeContent(node.id, 'Same content');

      // Verify
      assert.equal(result.id, node.id, 'Same node ID returned');
      const unchangedText = (result.message.content as any[])[0]?.text;
      assert.equal(unchangedText, 'Same content', 'Content unchanged');
      assert.equal(
        mockStoreWrapper.nodes.size,
        originalNodeCount,
        'No new nodes created'
      );
    });

    it('should reject editing assistant messages that contain tool calls (tool-use)', async () => {
      // Setup
      const parent = mockStoreWrapper.createTestNode(
        'parent_tool',
        'root1',
        null,
        createMessage('user', 'Parent node')
      );
      const nodeWithTool = mockStoreWrapper.createTestNode(
        'assistant_tool',
        'root1',
        parent.id,
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'noop', arguments: '{}' }
            }
          ]
        } as any
      );
      parent.child_ids = [nodeWithTool.id];
      await mockStoreWrapper.mockStore.saveNode(parent);
      await mockStoreWrapper.mockStore.saveNode(nodeWithTool);

      // Execute & Verify
      await assert.rejects(
        () => forest.editNodeContent(nodeWithTool.id, 'new text'),
        (err: any) => {
          assert.equal(
            err?.message?.includes(
              'Cannot edit a message containing tool-use blocks'
            ),
            true
          );
          return true;
        }
      );
    });
  });

  // Testing edge cases
  describe('edge cases', () => {
    it('should handle deeply nested node path when getting messages', async () => {
      // Setup - create a very deep nesting of nodes (10 levels)
      const config: RootConfig = {
        systemPrompt: 'You are a helpful assistant'
      };

      const root = mockStoreWrapper.createTestRoot('deep_root', config);

      const currentNodeId: NodeId = root.id;
      let parentNodeId = currentNodeId;
      const allNodes: Node[] = [root];

      // Create 10 levels of nesting
      for (let i = 1; i <= 10; i++) {
        const node = mockStoreWrapper.createTestNode(
          `node_${i}`,
          'deep_root',
          parentNodeId,
          createMessage('user', `Message at level ${i}`)
        );

        // Update parent's child_ids
        const parent = await mockStoreWrapper.mockStore.loadNode(parentNodeId);
        if (parent) {
          parent.child_ids.push(node.id);
          await mockStoreWrapper.mockStore.saveNode(parent);
        }

        parentNodeId = node.id;
        allNodes.push(node);
      }

      // Execute - get messages from the deepest node
      const result = await forest.getMessages(parentNodeId);

      // Verify
      assert.deepEqual(result.root, root);

      // Check that all messages are in correct order
      for (let i = 0; i < result.messages.length; i++) {
        const t = (result.messages[i].content as any[])[0]?.text;
        assert.equal(t, `Message at level ${i + 1}`);
      }
    });

    it('should handle multiple roots with identical configurations', async () => {
      // This tests JSON.stringify comparison logic in getOrCreateRoot

      // Setup - create two configs that are identical in content but with different object references
      const systemPrompt1 = 'You are a helpful assistant with temperature 0.7';

      // Create a separate but identical string
      const systemPrompt2 = 'You are a helpful assistant with temperature 0.7';

      // Create a root with the first config
      const root1 = await forest.getOrCreateRoot(systemPrompt1);

      // Now try to get/create a root with the second config
      const root2 = await forest.getOrCreateRoot(systemPrompt2);

      // Verify - should return the same root, even though configs are different object references
      assert.equal(root1.id, root2.id);
      assert.deepEqual(root1, root2);
    });
  });
});
