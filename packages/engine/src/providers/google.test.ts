import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { GoogleProvider } from './google.ts';
import type { ProviderRequest } from './types.ts';
import type { Logger } from '../log.ts';

const logger: Logger = { log: () => {} };

function createRequest(
  overrides: Partial<ProviderRequest> = {}
): ProviderRequest {
  return {
    systemMessage: 'You are helpful.',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }]
      }
    ],
    model: 'gemini-2.0-flash',
    parameters: {
      max_tokens: 128,
      temperature: 0.7
    },
    tools: undefined,
    tool_choice: undefined,
    ...overrides
  };
}

describe('GoogleProvider.generate', () => {
  it('forwards the abort signal to fetch and parses text responses', async () => {
    const provider = new GoogleProvider(logger, 'test-key');
    const controller = new AbortController();
    const request = createRequest();

    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        init: Parameters<typeof globalThis.fetch>[1]
      ) => {
        assert.ok(init, 'Request init is defined');
        assert.strictEqual(init?.signal, controller.signal);

        const body = {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hi there!' }],
                role: 'model'
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5
          }
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    );

    try {
      const response = await provider.generate(request, controller.signal);
      assert.strictEqual(fetchMock.mock.callCount(), 1);
      assert.strictEqual(response.message.role, 'assistant');
      assert.strictEqual(response.message.content[0].type, 'text');
      assert.strictEqual(response.message.content[0].text, 'Hi there!');
      assert.strictEqual(response.finish_reason, 'STOP');
      assert.deepStrictEqual(response.usage, {
        input_tokens: 10,
        output_tokens: 5,
        raw: {
          promptTokenCount: 10,
          candidatesTokenCount: 5
        }
      });
    } finally {
      fetchMock.mock.restore();
    }
  });

  it('converts functionCall parts into tool-use blocks', async () => {
    const provider = new GoogleProvider(logger, 'test-key');
    const request = createRequest();

    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      const body = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    id: 'call_123',
                    name: 'echo',
                    args: { message: 'Hello world' }
                  }
                }
              ],
              role: 'model'
            },
            finishReason: 'STOP'
          }
        ],
        usageMetadata: {}
      };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    try {
      const response = await provider.generate(request);
      assert.strictEqual(fetchMock.mock.callCount(), 1);
      const block = response.message.content[0];
      assert.strictEqual(block.type, 'tool-use');
      assert.strictEqual(block.id, 'call_123');
      assert.strictEqual(block.name, 'echo');
      assert.deepStrictEqual(block.parameters, { message: 'Hello world' });
    } finally {
      fetchMock.mock.restore();
    }
  });
});
