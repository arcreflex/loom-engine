// engine.test.ts
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LoomEngine } from './engine.ts'; // Adjust path as needed
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
        result: NodeData[];
        expectedRootConfig: RootConfig;
        expectedMessages: Message[][];
      }
    ) {
      assert.ok(Array.isArray(result), 'Result is array');
      assert.strictEqual(
        result.length,
        expectedMessages.length,
        'Result length matches expected'
      );

      const actualMessages = [];
      for (let i = 0; i < result.length; i++) {
        const { root, messages } = await engine
          .getForest()
          .getMessages(result[i].id);
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
      assert.strictEqual(result[0].metadata.source_info.type, 'model');
      if (result[0].metadata.source_info.type === 'model') {
        assert.strictEqual(
          result[0].metadata.source_info.provider,
          providerName
        );
        assert.strictEqual(
          result[0].metadata.source_info.model_name,
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

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        options,
        activeTools
      );

      // Verify the sequence of calls
      assert.strictEqual(
        mockProviderInstance.generate.mock.callCount(),
        2,
        'Provider called twice (tool call + final response)'
      );

      // Check that we get exactly one final assistant node
      assert.strictEqual(result.length, 1, 'One final assistant node returned');
      assert.strictEqual(
        result[0].message.role,
        'assistant',
        'Final node is assistant'
      );
      assert.strictEqual(
        result[0].message.content,
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

    it('should call onProgress callback for each node created during n>1 generation', async () => {
      const root = createTestRoot('r8', { systemPrompt: 'You are a poet' });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 2, max_tokens: 100, temperature: 0.7 };

      const progressNodes: NodeData[] = [];
      const onProgress = mock.fn((node: NodeData) => {
        progressNodes.push(node);
      });

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        options,
        undefined, // no active tools
        onProgress
      );

      // Verify onProgress was called for each generated node
      assert.strictEqual(
        onProgress.mock.callCount(),
        2,
        'onProgress called twice for n=2'
      );
      assert.strictEqual(
        progressNodes.length,
        2,
        'Two progress nodes captured'
      );

      // Verify that the progress nodes match the final result
      assert.deepEqual(
        progressNodes,
        result,
        'Progress nodes match final result'
      );

      // Verify all progress nodes are assistant messages
      progressNodes.forEach((node, i) => {
        assert.strictEqual(
          node.message.role,
          'assistant',
          `Progress node ${i} is assistant`
        );
        assert.strictEqual(
          node.message.content,
          `response ${i}`,
          `Progress node ${i} has correct content`
        );
      });
    });

    it('should call onProgress callback for tool-calling sequence', async () => {
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
      const onProgress = mock.fn((node: NodeData) => {
        progressNodes.push(node);
      });

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

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages,
        options,
        activeTools,
        onProgress
      );

      // Verify onProgress was called for user, tool result, and final assistant
      assert.strictEqual(
        onProgress.mock.callCount(),
        3,
        'onProgress called two times during tool-calling'
      );
      assert.strictEqual(
        progressNodes.length,
        3,
        'Three progress nodes captured'
      );

      // Check the sequence of progress nodes
      assert.strictEqual(
        progressNodes[0].message.role,
        'assistant',
        'First progress node is tool call'
      );
      assert.strictEqual(
        progressNodes[0].message.content,
        null,
        'Content of tool call is null'
      );
      assert.strictEqual(
        progressNodes[0].message.tool_calls?.length,
        1,
        'Tool call exists'
      );

      assert.strictEqual(
        progressNodes[1].message.role,
        'tool',
        'Second progress node is tool result'
      );
      assert.strictEqual(
        progressNodes[1].message.tool_call_id,
        'call_456',
        'Tool result has correct call ID'
      );
      assert.strictEqual(
        progressNodes[1].message.content,
        '{"echo":"Hello Progress"}',
        'Tool result content correct'
      );

      assert.strictEqual(
        progressNodes[2].message.role,
        'assistant',
        'Third progress node is final assistant'
      );
      assert.strictEqual(
        progressNodes[2].message.content,
        'Progress tracking works!',
        'Final assistant content correct'
      );

      // Verify final result matches the last progress node
      assert.strictEqual(result.length, 1, 'One final result');
      assert.deepEqual(
        result[0],
        progressNodes[2],
        'Final result matches last progress node'
      );
    });
  });
});
