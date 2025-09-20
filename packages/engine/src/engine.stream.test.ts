import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { LoomEngine, type GenerateEvent } from './engine.ts';
import { createMockStore, mockProviders } from './test-helpers.ts';
import { normalizeMessage } from './content-blocks.ts';
import {
  GenerationAbortedError,
  ToolIterationLimitExceededError
} from './errors.ts';
import type { MessageLegacy, ProviderName } from './types.ts';
import type { ProviderRequest, ProviderResponse } from './providers/types.ts';

// Helper to collect all events from a session
async function collectEvents(iterable: AsyncIterable<GenerateEvent>) {
  const events: GenerateEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

describe('LoomEngine.generateStream', () => {
  let engine: LoomEngine;
  let mockStoreWrapper: ReturnType<typeof createMockStore>;
  let mockProviderInstance: ReturnType<typeof mockProviders>;

  beforeEach(async () => {
    mockProviderInstance = mockProviders();
    mockStoreWrapper = createMockStore();
    engine = await LoomEngine.create(mockStoreWrapper.mockStore);
    engine.toolRegistry.register(
      'echo',
      'Echo tool',
      {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      },
      async ({ message }: { message?: string }) =>
        JSON.stringify({ echo: message ?? 'no message' }),
      'Test'
    );
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('streams provider, assistant, tool, and final events in order', async () => {
    const root = mockStoreWrapper.createTestRoot('root_stream');
    const providerName: ProviderName = 'openai';
    const modelName = 'gpt-stream';
    const userMessages: MessageLegacy[] = [
      { role: 'user', content: 'Call the echo tool' }
    ];
    const options = { n: 1, max_tokens: 100, temperature: 0.7 } as const;
    const activeTools = ['echo'];

    let callCount = 0;
    mockProviderInstance.generate.mock.mockImplementation(
      async (
        _req: ProviderRequest,
        signal?: AbortSignal
      ): Promise<ProviderResponse> => {
        assert(signal instanceof AbortSignal, 'signal provided to provider');
        callCount += 1;
        if (callCount === 1) {
          return {
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool-use',
                  id: 'call-1',
                  name: 'echo',
                  parameters: { message: 'hello' }
                }
              ]
            },
            finish_reason: 'tool_calls'
          };
        }
        return {
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Echo complete' }]
          },
          finish_reason: 'stop'
        };
      }
    );

    const session = engine.generateStream(
      root.id,
      providerName,
      modelName,
      userMessages.map(m => normalizeMessage(m)),
      options,
      activeTools
    );

    const events = await collectEvents(session);

    const sequence = events.map(e => e.type);
    assert.deepStrictEqual(sequence, [
      'provider_request',
      'provider_response',
      'assistant_node',
      'tool_result_node',
      'provider_request',
      'provider_response',
      'assistant_node',
      'done'
    ]);

    const toolEvent = events.find(
      (e): e is Extract<GenerateEvent, { type: 'tool_result_node' }> =>
        e.type === 'tool_result_node'
    );
    assert(toolEvent, 'tool event emitted');
    assert.strictEqual(toolEvent.node.message.role, 'tool');

    const doneEvent = events[events.length - 1] as Extract<
      GenerateEvent,
      { type: 'done' }
    >;
    assert.strictEqual(
      doneEvent.final.length,
      1,
      'final assistant node emitted once'
    );
  });

  it('supports aborting mid tool loop', async () => {
    const root = mockStoreWrapper.createTestRoot('root_abort');
    const providerName: ProviderName = 'openai';
    const modelName = 'gpt-abort';
    const userMessages: MessageLegacy[] = [
      { role: 'user', content: 'Call the echo tool' }
    ];
    const options = { n: 1, max_tokens: 100, temperature: 0.7 } as const;
    const activeTools = ['echo'];

    mockProviderInstance.generate.mock.mockImplementation(
      async (): Promise<ProviderResponse> => ({
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool-use',
              id: 'abort-call',
              name: 'echo',
              parameters: { message: 'stop me' }
            }
          ]
        },
        finish_reason: 'tool_calls'
      })
    );

    const session = engine.generateStream(
      root.id,
      providerName,
      modelName,
      userMessages.map(m => normalizeMessage(m)),
      options,
      activeTools
    );

    const events: GenerateEvent[] = [];
    for await (const event of session) {
      events.push(event);
      if (event.type === 'tool_result_node') {
        session.abort('user cancel');
      }
    }

    const lastEvent = events[events.length - 1];
    assert.strictEqual(lastEvent.type, 'error');
    assert(lastEvent.error instanceof GenerationAbortedError);
    assert.strictEqual(
      mockProviderInstance.generate.mock.callCount(),
      1,
      'no additional provider calls after abort'
    );
  });

  it('enforces maxToolIterations', async () => {
    const root = mockStoreWrapper.createTestRoot('root_limit');
    const providerName: ProviderName = 'openai';
    const modelName = 'gpt-limit';
    const userMessages: MessageLegacy[] = [
      { role: 'user', content: 'Call the echo tool repeatedly' }
    ];
    const options = {
      n: 1,
      max_tokens: 100,
      temperature: 0.7,
      maxToolIterations: 1
    } as const;
    const activeTools = ['echo'];

    mockProviderInstance.generate.mock.mockImplementation(
      async (): Promise<ProviderResponse> => ({
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool-use',
              id: 'loop-call',
              name: 'echo',
              parameters: { message: 'loop' }
            }
          ]
        },
        finish_reason: 'tool_calls'
      })
    );

    const session = engine.generateStream(
      root.id,
      providerName,
      modelName,
      userMessages.map(m => normalizeMessage(m)),
      options,
      activeTools
    );

    const events = await collectEvents(session);
    const lastEvent = events.at(-1);
    assert(lastEvent && lastEvent.type === 'error');
    assert(lastEvent.error instanceof ToolIterationLimitExceededError);
    assert.strictEqual(mockProviderInstance.generate.mock.callCount(), 1);
  });

  it('emits an error when tools are requested with n>1', async () => {
    const root = mockStoreWrapper.createTestRoot('root_tools_n');
    const providerName: ProviderName = 'openai';
    const modelName = 'gpt-tools-n';
    const userMessages: MessageLegacy[] = [
      { role: 'user', content: 'Call the echo tool' }
    ];
    const options = { n: 2, max_tokens: 50, temperature: 0.4 } as const;
    const activeTools = ['echo'];

    const session = engine.generateStream(
      root.id,
      providerName,
      modelName,
      userMessages.map(m => normalizeMessage(m)),
      options,
      activeTools
    );

    const events = await collectEvents(session);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'error');
    assert.strictEqual(
      mockProviderInstance.generate.mock.callCount(),
      0,
      'provider not called when configuration invalid'
    );
  });
});
