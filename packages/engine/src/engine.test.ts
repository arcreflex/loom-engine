// engine.test.ts
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LoomEngine, type GenerateResult } from './engine.ts'; // Adjust path as needed
import { createMockStore, mockProviders, mockRootId } from './test-helpers.ts'; // Import the helper
import type {
  RootConfig,
  ProviderName,
  Message,
  MessageV2,
  NodeData,
  Node
} from './types.ts'; // Adjust path as needed
import { normalizeMessage } from './content-blocks.ts';

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
      assert.deepStrictEqual(
        result.messages,
        [normalizeMessage(node1.message), normalizeMessage(node2.message)],
        'Engine.getMessages returns V2-normalized messages'
      );
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
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `response ${i++}` }]
          },
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
        expectedMessages: Array<Array<Message | MessageV2>>;
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
        const { root, messages } = await engine.getMessages(
          result.childNodes[i].id
        );
        assert.deepEqual(root, expectedRootConfig, 'Root config matches');
        actualMessages.push(messages);
      }

      const expectedNormalized = expectedMessages.map(arr =>
        arr.map(m => normalizeMessage(m as Message | MessageV2))
      );

      assert.deepEqual(actualMessages, expectedNormalized, 'Messages match');
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
        userMessages.map(m => normalizeMessage(m)),
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
        userMessages.map(m => normalizeMessage(m)),
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
        existingMessages.map(m => normalizeMessage(m)),
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

    it('coalesces adjacent assistant text messages before provider call (V2)', async () => {
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
        existingMessages.map(m => normalizeMessage(m)),
        options
      );

      // Assertions
      assert.strictEqual(
        mockProviderInstance.generate.mock.callCount(),
        1,
        'Provider called once'
      );
      // Ensure provider receives 2 messages (assistant coalesced)
      const firstCall = mockProviderInstance.generate.mock.calls[0]
        .arguments[0] as any;
      assert.strictEqual(firstCall.messages.length, 2);

      assert.deepEqual(
        mockProviderInstance.generate.mock.calls[0].arguments,
        [
          {
            systemMessage: 'system message',
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'Write a poem' }]
              },
              {
                role: 'assistant',
                content: [
                  { type: 'text', text: 'The first line is finished later.' }
                ]
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
        'Provider called with coalesced adjacent assistant V2 messages'
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

    it('should clamp tokens using model capabilities', async () => {
      const systemPrompt = 'system message';
      const rootConfig: RootConfig = { systemPrompt };
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4o-2024-08-06'; // known caps: out=16384
      const existingMessages: Message[] = [{ role: 'user', content: 'Short' }];

      const rootId = mockRootId('rootClamp');
      const root = createTestRoot(rootId.toString(), rootConfig);
      {
        let node: Node = root;
        for (let i = 0; i < existingMessages.length; i++) {
          node = createTestNode(
            `pre-${i}`,
            root.id,
            node.id,
            existingMessages[i]
          );
        }
      }

      const options = { n: 1, max_tokens: 999999, temperature: 0.7 };
      await engine.generate(
        root.id,
        providerName,
        modelName,
        existingMessages.map(m => normalizeMessage(m)),
        options
      );

      // Assert provider called with clamped max_tokens (derived from model caps)
      const firstCall =
        (mockProviderInstance.generate.mock.calls[0] as any) ?? [];
      const argsArr = firstCall.arguments ?? firstCall;
      const callArgs = argsArr[0];
      if (!callArgs || !callArgs.parameters)
        throw new Error('provider call missing parameters');
      const { KNOWN_MODELS } = await import('./browser.ts');
      const expectedCap =
        KNOWN_MODELS['openai/gpt-4o-2024-08-06']?.capabilities
          ?.max_output_tokens;
      if (callArgs.parameters.max_tokens !== expectedCap) {
        throw new Error(
          `expected clamped max_tokens ${expectedCap}, got ${callArgs.parameters.max_tokens}`
        );
      }
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
            userMessages.map(m => normalizeMessage(m)),
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
            userMessages.map(m => normalizeMessage(m)),
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
              content: [
                {
                  type: 'tool-use',
                  id: 'call_123',
                  name: 'echo',
                  parameters: { message: 'Hello World' }
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
              content: [
                { type: 'text', text: 'I echoed your message successfully!' }
              ]
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
        userMessages.map(m => normalizeMessage(m)),
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
      // V2: extract text content
      const finalText0 =
        (result.childNodes[0].message.content[0] as any)?.text ?? null;
      assert.strictEqual(finalText0, 'I echoed your message successfully!');

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
      const user0Text = (nodeArray[0].message.content[0] as any)?.text ?? null;
      assert.strictEqual(user0Text, 'Echo "Hello World"');

      assert.strictEqual(
        nodeArray[1].message.role,
        'assistant',
        'Second node is assistant tool call'
      );
      // V2: assert tool-use block exists with expected id/name/parameters
      const toolUse1 = (nodeArray[1].message.content as any[]).find(
        b => b.type === 'tool-use'
      );
      assert(toolUse1, 'Assistant tool call exists');
      assert.strictEqual(toolUse1.id, 'call_123');
      assert.strictEqual(toolUse1.name, 'echo');
      assert.deepStrictEqual(toolUse1.parameters, { message: 'Hello World' });

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
      const tool2Text = (nodeArray[2].message.content[0] as any)?.text ?? null;
      assert.strictEqual(tool2Text, '{"echo":"Hello World"}');

      assert.strictEqual(
        nodeArray[3].message.role,
        'assistant',
        'Fourth node is final assistant response'
      );
      const final3Text = (nodeArray[3].message.content[0] as any)?.text ?? null;
      assert.strictEqual(final3Text, 'I echoed your message successfully!');
    });

    it('should execute multiple tool calls in one assistant turn and recurse', async () => {
      const root = createTestRoot('r_multi', {
        systemPrompt: 'You are a helpful assistant'
      });
      const providerName: ProviderName = 'openai';
      const modelName = 'gpt-4';
      const userMessages: Message[] = [{ role: 'user', content: 'Echo twice' }];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const activeTools = ['echo'];

      mockProviderInstance.generate.mock.resetCalls();

      let callCount = 0;
      mockProviderInstance.generate.mock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: return two tool calls in one assistant message
          return {
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool-use',
                  id: 'c1',
                  name: 'echo',
                  parameters: { message: 'one' }
                },
                {
                  type: 'tool-use',
                  id: 'c2',
                  name: 'echo',
                  parameters: { message: 'two' }
                }
              ]
            },
            finish_reason: 'tool_calls',
            usage: { input_tokens: 12, output_tokens: 6 }
          };
        } else {
          return {
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Both tools executed.' }]
            },
            finish_reason: 'stop',
            usage: { input_tokens: 20, output_tokens: 10 }
          };
        }
      });

      let result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages.map(m => normalizeMessage(m)),
        options,
        activeTools
      );
      while (result.next) result = await result.next;

      // Provider called twice (tool turn + final)
      assert.strictEqual(mockProviderInstance.generate.mock.callCount(), 2);

      // Expect 1 final node returned
      assert.strictEqual(result.childNodes.length, 1);
      assert.strictEqual(result.childNodes[0].message.role, 'assistant');
      const finalBoth = (result.childNodes[0].message.content[0] as any)?.text;
      assert.strictEqual(finalBoth, 'Both tools executed.');

      // Verify two tool result nodes were created with matching IDs
      const created = Array.from(mockStoreWrapper.nodes.values());
      const toolNodes = created.filter(
        (
          n
        ): n is typeof n & {
          message: { role: 'tool'; tool_call_id: string };
        } => n.message.role === 'tool'
      );
      assert.strictEqual(toolNodes.length, 2);
      const ids = toolNodes.map(n => n.message.tool_call_id).sort();
      assert.deepStrictEqual(ids, ['c1', 'c2']);
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
              content: [
                {
                  type: 'tool-use',
                  id: 'call_456',
                  name: 'echo',
                  parameters: { message: 'Hello Progress' }
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
              content: [{ type: 'text', text: 'Progress tracking works!' }]
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
        userMessages.map(m => normalizeMessage(m)),
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
      const toolRes0 = (progressNodes[0].message.content[0] as any)?.text;
      assert.strictEqual(toolRes0, '{"echo":"Hello Progress"}');

      const toolResultParent = mockStoreWrapper.nodes.get(
        progressNodes[0].parent_id
      );

      assert.strictEqual(
        toolResultParent?.message.role,
        'assistant',
        'First progress node is tool call'
      );
      const assistantBlocks = (toolResultParent as any)?.message?.content;
      assert(Array.isArray(assistantBlocks), 'Assistant content is blocks');
      const toolCalls = assistantBlocks.filter(
        (b: any) => b.type === 'tool-use'
      );
      assert.strictEqual(toolCalls.length, 1, 'Tool call exists');

      assert.strictEqual(
        progressNodes[1].message.role,
        'assistant',
        'Second progress node is final assistant'
      );
      const finalProgText = (progressNodes[1].message.content[0] as any)?.text;
      assert.strictEqual(finalProgText, 'Progress tracking works!');

      // Verify final result matches the last progress node
      assert.strictEqual(result.childNodes.length, 1, 'One final result');
      assert.deepEqual(
        result.childNodes[0],
        progressNodes[1],
        'Final result matches last progress node'
      );
    });

    it('handles tool-only assistant messages correctly through round-trip', async () => {
      const root = createTestRoot('root_tool_only', { systemPrompt: 'Test' });
      const providerName: ProviderName = 'openai' as ProviderName;
      const modelName = 'gpt-4';

      const mockProviderInstance = mockProviders();
      let callCount = 0;

      mockProviderInstance.generate.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: return tool-only message (no text content)
          return Promise.resolve({
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool-use',
                  id: 'call_tool_only',
                  name: 'test_echo',
                  parameters: { message: 'Tool-only message test' }
                }
              ]
            },
            finish_reason: 'tool_calls',
            usage: { input_tokens: 10, output_tokens: 5 }
          });
        } else {
          // Second call: after tool execution
          return Promise.resolve({
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Tool execution completed successfully!' }
              ]
            },
            finish_reason: 'stop',
            usage: { input_tokens: 20, output_tokens: 10 }
          });
        }
      });

      (engine as any).getProvider = () => mockProviderInstance;

      // Register the test_echo tool
      engine.toolRegistry.register(
        'test_echo',
        'Echo the message for testing',
        {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        },
        async (args: any) => `Echo: ${args.message}`
      );

      const userMessages: Message[] = [
        { role: 'user', content: 'Use the echo tool' }
      ];

      const options = { n: 1, temperature: 0.7, max_tokens: 100 };
      const activeTools = ['test_echo'];

      const result = await engine.generate(
        root.id,
        providerName,
        modelName,
        userMessages.map(m => normalizeMessage(m)),
        options,
        activeTools
      );

      // For a tool-only message, the first response creates an assistant node with tool calls
      // The test primarily verifies that V2 tool-only messages are properly converted to legacy format

      // Check that we got a result
      assert(
        result.childNodes.length > 0,
        'Should have at least one child node'
      );

      // The first node should be an assistant message (after tool-only conversion)
      const firstNode = result.childNodes[0];

      // If it's a tool message, get its parent which should be the assistant node
      let assistantNode: any;
      if (firstNode.message.role === 'tool') {
        assistantNode = mockStoreWrapper.nodes.get(firstNode.parent_id);
      } else if (firstNode.message.role === 'assistant') {
        assistantNode = firstNode;
      } else {
        assert.fail(`Unexpected first node role: ${firstNode.message.role}`);
      }

      // Verify the assistant node has the expected tool-only structure (V2: tool-use block only)
      assert(assistantNode, 'Assistant node should exist');
      assert.strictEqual(assistantNode.message.role, 'assistant');
      const onlyBlocks = assistantNode.message.content as any[];
      const onlyToolUse = onlyBlocks.filter(b => b.type === 'tool-use');
      assert.strictEqual(onlyToolUse.length, 1, 'One tool-use block');
      assert.strictEqual(onlyToolUse[0].id, 'call_tool_only');
      assert.strictEqual(onlyToolUse[0].name, 'test_echo');
      assert.deepStrictEqual(onlyToolUse[0].parameters, {
        message: 'Tool-only message test'
      });
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
      const editedText = (result.message.content[0] as any)?.text;
      assert.equal(editedText, 'Edited content', 'Content updated');
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
      const newContentText = (result.message.content[0] as any)?.text;
      assert.equal(newContentText, 'New content', 'New content applied');
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
      assert.equal(
        (result.message.content[0] as any)?.text,
        'New content',
        'Content updated'
      );
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
      assert.equal(
        (result.message.content[0] as any)?.text,
        'New content',
        'Content updated'
      );
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
