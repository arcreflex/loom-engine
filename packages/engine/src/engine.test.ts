// engine.test.ts
import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { LoomEngine } from './engine.ts'; // Adjust path as needed
import { createMockStore, mockProviders, mockRootId } from './test-helpers.ts'; // Import the helper
import type { RootConfig, Message, NodeData, Node } from './types.ts'; // Adjust path as needed

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
        providerType: 'openai',
        model: 'gpt-4-turbo'
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
      const rootConfig: RootConfig = { providerType: 'openai', model: 'gpt-4' };
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };
      const result = await engine.generate(rootConfig, userMessages, options);

      // --- Assertions ---
      await assertGenerateResult(engine, {
        result,
        expectedRootConfig: rootConfig,
        expectedMessages: [
          [...userMessages, { role: 'assistant', content: 'response 0' }]
        ]
      });
    });

    it('should handle n > 1 correctly', async () => {
      const rootConfig: RootConfig = { providerType: 'openai', model: 'gpt-4' };
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const optionsN2 = { n: 2, max_tokens: 100, temperature: 0.7 };

      const result = await engine.generate(rootConfig, userMessages, optionsN2);

      // Assertions
      await assertGenerateResult(engine, {
        result,
        expectedRootConfig: rootConfig,
        expectedMessages: [
          [...userMessages, { role: 'assistant', content: 'response 0' }],
          [...userMessages, { role: 'assistant', content: 'response 1' }]
        ]
      });
    });

    it('should append correctly if user message prefix already exists', async () => {
      const rootConfig: RootConfig = { providerType: 'openai', model: 'gpt-4' };
      const existingMessages: Message[] = [
        { role: 'user', content: 'Write a poem' },
        { role: 'assistant', content: 'A short poem.' }
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
        rootConfig,
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
      const rootConfig: RootConfig = {
        providerType: 'openai',
        model: 'gpt-4',
        systemPrompt: 'system message'
      };
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
        rootConfig,
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
              temperature: 0.7
            }
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
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };

      const unsupportedConfig: RootConfig = {
        providerType: 'unsupported' as any,
        model: 'some-model'
      };

      await assert.rejects(
        () => engine.generate(unsupportedConfig, userMessages, options),
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
      const rootConfig: RootConfig = { providerType: 'openai', model: 'gpt-4' };
      const userMessages: Message[] = [
        { role: 'user', content: 'Write a poem' }
      ];
      const options = { n: 1, max_tokens: 100, temperature: 0.7 };

      const providerError = new Error('API limit reached');
      mockProviderInstance.generate.mock.mockImplementationOnce(() =>
        Promise.reject(providerError)
      );

      await assert.rejects(
        () => engine.generate(rootConfig, userMessages, options),
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
  });
});
