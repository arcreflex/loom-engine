// engine.test.ts
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LoomEngine, type GenerateResult } from './engine.ts'; // Adjust path as needed
import { createMockStore, mockProviders, mockRootId } from './test-helpers.ts'; // Import the helper
import type {
  RootConfig,
  ProviderName,
  Message,
  NodeData,
  Node
} from './types.ts'; // Adjust path as needed

describe('LoomEngine', () => {
  let engine: LoomEngine;

  let mockStoreWrapper: ReturnType<typeof createMockStore>;
  let createTestNode: ReturnType<typeof createMockStore>['createTestNode'];
  let createTestRoot: ReturnType<typeof createMockStore>['createTestRoot'];
  let mockProviderInstance: ReturnType<typeof mockProviders>;

  beforeEach(async () => {
    mockProviderInstance = mockProviders();
    mockStoreWrapper = createMockStore();
    createTestNode = mockStoreWrapper.createTestNode;
    createTestRoot = mockStoreWrapper.createTestRoot;

    // Create engine with the stateful mock store instance
    engine = await LoomEngine.create(mockStoreWrapper.mockStore);

    // Add echo tool for testing
    engine.toolRegistry.register(
      'echo',
      'Echoes the input back to the user.',
      {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to echo.' }
        },
        required: ['message']
      },
      async (args: { message?: string }) =>
        JSON.stringify({ echo: args.message ?? 'No message provided' }),
      'Built-in'
    );
  });

  afterEach(() => {
    // Restore original implementations of mocked methods/classes
    mock.restoreAll();
  });

  // --- getMessages Tests ---
  describe('getMessages', () => {
    it('should retrieve message path and root config from the store via Forest', async () => {
      const rootConfig: RootConfig = {
        systemPrompt: 'You are a helpful assistant'
      };
      const root = createTestRoot('r1', rootConfig);
      const node1 = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Hello'
      });
      const node2 = createTestNode('n2', root.id, node1.id, {
        role: 'assistant',
        content: 'Hi there!'
      });
      // Update parent's child_ids (Forest would do this on save, mimic it here)
      node1.child_ids.push(node2.id);
      mockStoreWrapper.nodes.set(node1.id, node1); // Update map with child_id

      const result = await engine.getMessages(node2.id);

      // Assertions
      assert.ok(
        mockStoreWrapper.mockStore.loadNode.mock.callCount() >= 2,
        'loadNode called for path'
      ); // n2, n1
      assert.ok(
        mockStoreWrapper.mockStore.loadRootInfo.mock.callCount() >= 1,
        'loadRootInfo called'
      );
      assert.deepStrictEqual(result.root, rootConfig);
      assert.deepStrictEqual(result.messages, [node1.message, node2.message]);
    });

    it('should throw if a node in the path is missing (consistency issue)', async () => {
      const root = createTestRoot('r1');
      const node1 = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Hello'
      });
      const node2 = createTestNode('n2', root.id, node1.id, {
        role: 'assistant',
        content: 'Hi there!'
      });
      node1.child_ids.push(node2.id);
      mockStoreWrapper.nodes.set(node1.id, node1);

      // Remove the intermediate node from the store
      mockStoreWrapper.nodes.delete(node1.id);

      await assert.rejects(
        () => engine.getMessages(node2.id),
        /Node not found/ // Forest throws this when traversal fails
      );
    });
  });

  // --- generate Tests ---
  describe('generate', () => {
    beforeEach(() => {
      mockStoreWrapper.nodes.clear();
      mockStoreWrapper.roots.clear();

      mockProviderInstance.generate.mock.resetCalls();

      let i = 0;
      mockProviderInstance.generate.mock.mockImplementation(() =>
        Promise.resolve({
          message: { role: 'assistant', content: `response ${i++}` },
          finish_reason: 'stop',
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      );
    });

    async function assertGenerateResult(
      engine: LoomEngine,
      {
        result,
        expectedMessages,
        expectedRootConfig
      }: {
        result: GenerateResult;
        expectedRootConfig: RootConfig;
        expectedMessages: Message[][];
      }
    ) {
      assert.ok(Array.isArray(result.childNodes), 'Result is array');
      assert.strictEqual(
        result.childNodes.length,
        expectedMessages.length,
        'Result length matches expected'
      );

      const actualMessages = [];
      for (let i = 0; i < result.childNodes.length; i++) {
        const { root, messages } = await engine
          .getForest()
          .getMessages(result.childNodes[i].id);
        assert.deepEqual(
          root.config,
          expectedRootConfig,
          'Root config matches'
        );
        actualMessages.push(messages);
      }

      assert.deepEqual(actualMessages, expectedMessages, 'Messages match');
    }

    it('should create root, append user message, call provider, append assistant message for n=1', async () => {
      // Pre-conditions: maps are empty

      // Action
      const systemPrompt = 'You are a poet';
      const root = createTestRoot('r1', { systemPrompt });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        options
      );

      // --- Assertions ---
      await assertGenerateResult(engine, {
        result,
        expectedRootConfig: { systemPrompt },
        expectedMessages: [
          [...userMessages, { role: 'assistant', content: 'response 0' }]
        ]
      });

      // Check source_info
      assert.strictEqual(
        result.childNodes[0].metadata.source_info.type,
        'model'
      );
      if (result.childNodes[0].metadata.source_info.type === 'model') {
        assert.strictEqual(
          result.childNodes[0].metadata.source_info.provider,
          providerName
        );
        assert.strictEqual(
          result.childNodes[0].metadata.source_info.model_name,
          modelName
        );
      }
    });

    it('should handle n > 1 correctly', async () => {
      const systemPrompt = 'You are a poet';
      const root = createTestRoot('r2', { systemPrompt });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const optionsN2 = { n: 2, max_tokens: 100, temperature: 0.7 };

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        optionsN2
      );

      // Assertions
      await assertGenerateResult(engine, {
        result,
        expectedRootConfig: { systemPrompt },
        expectedMessages: [
          [...userMessages, { role: 'assistant', content: 'response 0' }],
          [...userMessages, { role: 'assistant', content: 'response 1' }]
        ]
      });
    });

    it('should append correctly if user message prefix already exists', async () => {
      const systemPrompt = 'You are a poet';
      const rootConfig: RootConfig = { systemPrompt };
      const existingMessages: Message[] = [
        { role: 'user', content: 'Write a poem' },
        { role: 'assistant', content: 'A short poem.' }
      ];

      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const rootId = mockRootId('root1');

      const root = createTestRoot(rootId.toString(), rootConfig);
      {
        let node: Node = root;
        for (let i = 0; i < existingMessages.length; i++) {
          node = createTestNode(
            `existing-${i}`,
            root.id,
            node.id,
            existingMessages[i]
          );
        }
      }

      const startNodeCount = mockStoreWrapper.nodes.size;

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        existingMessages,
        options
      );

      // Assertions
      assert.strictEqual(
        mockStoreWrapper.nodes.size,
        startNodeCount + 1,
        'Exactly one node is added'
      );
      await assertGenerateResult(engine, {
        result,
        expectedRootConfig: rootConfig,
        expectedMessages: [
          [...existingMessages, { role: 'assistant', content: 'response 0' }]
        ]
      });
    });

    it('should coalesce messages before sending them to the provider', async () => {
      const systemPrompt = 'system message';
      const rootConfig: RootConfig = { systemPrompt };
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const existingMessages: Message[] = [
        { role: 'user', content: 'Write a poem' },
        { role: 'assistant', content: 'The first line is' },
        { role: 'assistant', content: ' finished later.' }
      ];

      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const rootId = mockRootId('root1');
      const root = createTestRoot(rootId.toString(), rootConfig);
      {
        let node: Node = root;
        for (let i = 0; i < existingMessages.length; i++) {
          node = createTestNode(
            `existing-${i}`,
            root.id,
            node.id,
            existingMessages[i]
          );
        }
      }

      const startNodeCount = mockStoreWrapper.nodes.size;

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        existingMessages,
        options
      );

      // Assertions
      assert.strictEqual(
        mockProviderInstance.generate.mock.callCount(),
        1,
        'Provider called once'
      );
      assert.deepEqual(
        mockProviderInstance.generate.mock.calls[0].arguments,
        [
          {
            systemMessage: 'system message',
            messages: [
              {
                role: 'user',
                content: 'Write a poem'
              },
              {
                role: 'assistant',
                content: 'The first line is finished later.'
              }
            ],
            model: 'gpt-4',
            parameters: {
              max_tokens: 100,
              temperature: 0.7,
              model: 'gpt-4'
            },
            tools: undefined
          }
        ],
        'Provider called with coalesced messages'
      );

      assert.strictEqual(
        mockStoreWrapper.nodes.size,
        startNodeCount + 1,
        'Exactly one node is added'
      );
      await assertGenerateResult(engine, {
        result,
        expectedRootConfig: rootConfig,
        expectedMessages: [
          [...existingMessages, { role: 'assistant', content: 'response 0' }]
        ]
      });
    });

    it('should throw an error for unsupported provider types', async () => {
      const root = createTestRoot('r5', { systemPrompt: 'test' });
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const unsupportedProvider = 'unsupported' as any;
      const modelName = 'some-model';

      await assert.rejects(
        () =>
          engine.generate(
            root.id,
            unsupportedProvider,
            modelName,
            userMessages,
            options
          ),
        /Unsupported provider: unsupported/
      );

      // Ensure it fails early (root might be created before check)
      assert.strictEqual(
        mockStoreWrapper.mockStore.saveNode.mock.callCount(),
        0,
        'No nodes saved'
      );
      assert.strictEqual(
        mockProviderInstance.generate.mock.callCount(),
        0,
        'Provider not called'
      );
    });

    it('should propagate errors from provider.generate', async () => {
      const root = createTestRoot('r6', { systemPrompt: 'test' });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };

      const providerError = new Error('API limit reached');
      mockProviderInstance.generate.mock.mockImplementationOnce(() =>
        Promise.reject(providerError)
      );

      await assert.rejects(
        () =>
          engine.generate(
            root.id,
            providerName,
            modelName,
            userMessages,
            options
          ),
        providerError
      );

      // Ensure user node was still appended
      assert.strictEqual(mockStoreWrapper.nodes.size, 0, 'User is not created');
      assert.strictEqual(
        mockProviderInstance.generate.mock.callCount(),
        1,
        'Provider was called once'
      );
    });

    it('should execute a tool call and return a final response', async () => {
      const root = createTestRoot('r7', {
        systemPrompt: 'You are a helpful assistant'
      });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [
        { role: 'user', content: 'Echo "Hello World"' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const activeTools = ['echo'];

      // Reset mock and setup new implementation
      mockProviderInstance.generate.mock.resetCalls();

      let callCount = 0;
      mockProviderInstance.generate.mock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: return tool call
          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'echo',
                    arguments: '{"message": "Hello World"}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls',
            usage: { input_tokens: 10, output_tokens: 5 }
          };
        } else {
          // Second call: return final response
          return {
            message: {
              role: 'assistant',
              content: 'I echoed your message successfully!'
            },
            finish_reason: 'stop',
            usage: { input_tokens: 15, output_tokens: 8 }
          };
        }
      });

      let result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        options,
        activeTools
      );
      while (result.next) {
        result = await result.next;
      }

      // Verify the sequence of calls
      assert.strictEqual(
        mockProviderInstance.generate.mock.callCount(),
        2,
        'Provider called twice (tool call + final response)'
      );

      // Check that we get exactly one final assistant node
      assert.strictEqual(
        result.childNodes.length,
        1,
        'One final assistant node returned'
      );
      assert.strictEqual(
        result.childNodes[0].message.role,
        'assistant',
        'Final node is assistant'
      );
      assert.strictEqual(
        result.childNodes[0].message.content,
        'I echoed your message successfully!',
        'Final response content matches'
      );

      // Verify that 4 nodes were created: user, assistant (tool call), tool (result), assistant (final)
      assert.strictEqual(
        mockStoreWrapper.nodes.size,
        4,
        'Four nodes created in sequence'
      );

      // Verify the sequence of node types
      const nodeArray = Array.from(mockStoreWrapper.nodes.values());
      assert.strictEqual(
        nodeArray[0].message.role,
        'user',
        'First node is user message'
      );
      assert.strictEqual(
        nodeArray[0].message.content,
        'Echo "Hello World"',
        'User message content matches'
      );

      assert.strictEqual(
        nodeArray[1].message.role,
        'assistant',
        'Second node is assistant tool call'
      );
      assert.deepStrictEqual(
        nodeArray[1].message.tool_calls,
        [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'echo',
              arguments: '{"message": "Hello World"}'
            }
          }
        ],
        'Assistant tool call matches'
      );

      assert.strictEqual(
        nodeArray[2].message.role,
        'tool',
        'Third node is tool result'
      );
      assert.strictEqual(
        nodeArray[2].message.tool_call_id,
        'call_123',
        'Tool result has correct call ID'
      );
      assert.strictEqual(
        nodeArray[2].message.content,
        '{"echo":"Hello World"}',
        'Tool result content matches'
      );

      assert.strictEqual(
        nodeArray[3].message.role,
        'assistant',
        'Fourth node is final assistant response'
      );
      assert.strictEqual(
        nodeArray[3].message.content,
        'I echoed your message successfully!',
        'Final assistant content matches'
      );
    });

    it('should return a `next` promise tool-calling sequence', async () => {
      const root = createTestRoot('r9', {
        systemPrompt: 'You are a helpful assistant'
      });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [
        { role: 'user', content: 'Echo "Hello Progress"' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const activeTools = ['echo'];

      const progressNodes: NodeData[] = [];

      // Reset mock and setup tool-calling sequence
      mockProviderInstance.generate.mock.resetCalls();

      let callCount = 0;
      mockProviderInstance.generate.mock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: return tool call
          return {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_456',
                  type: 'function',
                  function: {
                    name: 'echo',
                    arguments: '{"message": "Hello Progress"}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls',
            usage: { input_tokens: 10, output_tokens: 5 }
          };
        } else {
          // Second call: return final response
          return {
            message: {
              role: 'assistant',
              content: 'Progress tracking works!'
            },
            finish_reason: 'stop',
            usage: { input_tokens: 15, output_tokens: 8 }
          };
        }
      });

      let result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        options,
        activeTools
      );
      progressNodes.push(result.childNodes[0]);
      while (result.next) {
        result = await result.next;
        progressNodes.push(result.childNodes[0]);
      }

      assert.strictEqual(
        progressNodes.length,
        2,
        'Two progress nodes captured'
      );

      assert.strictEqual(
        progressNodes[0].message.role,
        'tool',
        'First progress node is tool result'
      );
      assert.strictEqual(
        progressNodes[0].message.tool_call_id,
        'call_456',
        'Tool result has correct call ID'
      );
      assert.strictEqual(
        progressNodes[0].message.content,
        '{"echo":"Hello Progress"}',
        'Tool result content correct'
      );

      const toolResultParent = mockStoreWrapper.nodes.get(
        progressNodes[0].parent_id
      );

      assert.strictEqual(
        toolResultParent?.message.role,
        'assistant',
        'First progress node is tool call'
      );
      assert.strictEqual(
        toolResultParent?.message.content,
        null,
        'Content of tool call is null'
      );
      assert.strictEqual(
        toolResultParent?.message.tool_calls?.length,
        1,
        'Tool call exists'
      );

      assert.strictEqual(
        progressNodes[1].message.role,
        'assistant',
        'Second progress node is final assistant'
      );
      assert.strictEqual(
        progressNodes[1].message.content,
        'Progress tracking works!',
        'Final assistant content correct'
      );

      // Verify final result matches the last progress node
      assert.strictEqual(result.childNodes.length, 1, 'One final result');
      assert.deepEqual(
        result.childNodes[0],
        progressNodes[1],
        'Final result matches last progress node'
      );
    });
  });

  // --- editNode Tests ---
  describe('editNode', () => {
    it('should edit node content in place and return same node when no children', async () => {
      // Setup
      const root = createTestRoot('r1', { systemPrompt: 'Test' });
      const node = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Original content'
      });
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute
      const result = await engine.editNode(node.id, 'Edited content');

      // Verify
      assert.equal(result.id, node.id, 'Same node ID returned');
      assert.equal(result.message.content, 'Edited content', 'Content updated');
      assert.equal(result.message.role, 'user', 'Role preserved');
      assert.deepEqual(
        result.metadata.source_info,
        { type: 'user' },
        'Source info updated'
      );
    });

    it('should create new branch when editing node with children', async () => {
      // Setup
      const root = createTestRoot('r1', { systemPrompt: 'Test' });
      const node = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Original content'
      });
      const child = createTestNode('c1', root.id, node.id, {
        role: 'assistant',
        content: 'Child response'
      });
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      const originalNodeCount = mockStoreWrapper.nodes.size;

      // Execute
      const result = await engine.editNode(node.id, 'New content');

      // Verify
      assert.notEqual(result.id, node.id, 'New node created');
      assert.equal(
        result.message.content,
        'New content',
        'New content applied'
      );
      assert.equal(result.message.role, 'user', 'Role preserved');
      assert.equal(
        mockStoreWrapper.nodes.size,
        originalNodeCount + 1,
        'One new node created'
      );
    });

    it('should move bookmark when edit creates new node', async () => {
      // Setup
      const mockConfigStore = {
        get: mock.fn(() => ({
          bookmarks: [
            {
              nodeId: 'n1',
              title: 'Test Bookmark',
              rootId: 'r1',
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z'
            },
            {
              nodeId: 'other',
              title: 'Other Bookmark',
              rootId: 'r1',
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z'
            }
          ]
        })),
        update: mock.fn(),
        log: mock.fn()
      };

      const engineWithConfig = await LoomEngine.create(
        mockStoreWrapper.mockStore,
        mockConfigStore as any
      );

      const root = createTestRoot('r1', { systemPrompt: 'Test' });
      const node = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Original content'
      });
      const child = createTestNode('c1', root.id, node.id, {
        role: 'assistant',
        content: 'Child response'
      });
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      // Execute
      const result = await engineWithConfig.editNode(node.id, 'New content');

      // Verify bookmark was moved
      assert.equal(
        mockConfigStore.update.mock.calls.length,
        1,
        'Config update called once'
      );
      const updateCall = mockConfigStore.update.mock.calls[0];
      const updatedBookmarks = updateCall.arguments[0].bookmarks;

      assert.equal(updatedBookmarks.length, 2, 'Two bookmarks remain');
      const movedBookmark = updatedBookmarks.find(
        (b: any) => b.title === 'Test Bookmark'
      );
      assert.ok(movedBookmark, 'Bookmark found');
      assert.equal(
        movedBookmark.nodeId,
        result.id,
        'Bookmark moved to new node'
      );
      assert.notEqual(
        movedBookmark.updatedAt,
        '2023-01-01T00:00:00Z',
        'Bookmark updatedAt changed'
      );
    });

    it('should not move bookmark when edit is in place', async () => {
      // Setup
      const mockConfigStore = {
        get: mock.fn(() => ({
          bookmarks: [
            {
              nodeId: 'n1',
              title: 'Test Bookmark',
              rootId: 'r1',
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z'
            }
          ]
        })),
        update: mock.fn(),
        log: mock.fn()
      };

      const engineWithConfig = await LoomEngine.create(
        mockStoreWrapper.mockStore,
        mockConfigStore as any
      );

      const root = createTestRoot('r1', { systemPrompt: 'Test' });
      const node = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Original content'
      });
      await mockStoreWrapper.mockStore.saveNode(node);

      // Execute - edit in place (no children)
      const result = await engineWithConfig.editNode(node.id, 'Edited content');

      // Verify bookmark was not moved
      assert.equal(result.id, node.id, 'Same node returned');
      assert.equal(
        mockConfigStore.update.mock.calls.length,
        0,
        'Config update not called'
      );
    });

    it('should work without configStore', async () => {
      // Setup - engine without configStore
      const engineNoConfig = await LoomEngine.create(
        mockStoreWrapper.mockStore
      );

      const root = createTestRoot('r1', { systemPrompt: 'Test' });
      const node = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Original content'
      });
      const child = createTestNode('c1', root.id, node.id, {
        role: 'assistant',
        content: 'Child response'
      });
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      // Execute
      const result = await engineNoConfig.editNode(node.id, 'New content');

      // Verify - should work without errors
      assert.notEqual(result.id, node.id, 'New node created');
      assert.equal(result.message.content, 'New content', 'Content updated');
    });

    it('should handle bookmark not found during move', async () => {
      // Setup
      const mockConfigStore = {
        get: mock.fn(() => ({
          bookmarks: [
            {
              nodeId: 'other',
              title: 'Other Bookmark',
              rootId: 'r1',
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z'
            }
          ]
        })),
        update: mock.fn(),
        log: mock.fn()
      };

      const engineWithConfig = await LoomEngine.create(
        mockStoreWrapper.mockStore,
        mockConfigStore as any
      );

      const root = createTestRoot('r1', { systemPrompt: 'Test' });
      const node = createTestNode('n1', root.id, null, {
        role: 'user',
        content: 'Original content'
      });
      const child = createTestNode('c1', root.id, node.id, {
        role: 'assistant',
        content: 'Child response'
      });
      node.child_ids = [child.id];
      await mockStoreWrapper.mockStore.saveNode(node);
      await mockStoreWrapper.mockStore.saveNode(child);

      // Execute - edit node that doesn't have a bookmark
      const result = await engineWithConfig.editNode(node.id, 'New content');

      // Verify - should work without errors, no bookmark update
      assert.notEqual(result.id, node.id, 'New node created');
      assert.equal(result.message.content, 'New content', 'Content updated');
      assert.equal(
        mockConfigStore.update.mock.calls.length,
        0,
        'Config update not called'
      );
    });

    it('should propagate errors from forest.editNodeContent', async () => {
      // Setup
      const nonExistentNodeId = 'nonexistent' as any;

      // Execute & Verify
      await assert.rejects(
        async () => await engine.editNode(nonExistentNodeId, 'New content'),
        {
          name: 'Error',
          message: `Node not found or is a root: ${nonExistentNodeId}`
        }
      );
    });
  });
});
