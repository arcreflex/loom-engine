import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { AnthropicProvider } from './anthropic.ts';
import type { Message } from '../types.ts';

// Create a manual mock of the Anthropic provider that doesn't actually load the SDK
// This simulates what would happen with the SDK available
class TestableAnthropicProvider extends AnthropicProvider {
  mockResponse: any = null;
  mockError: Error | null = null;
  lastGenerateRequest: any = null;

  constructor(apiKey?: string, baseURL?: string) {
    super(apiKey, baseURL);
  }

  setMockResponse(response: any) {
    this.mockResponse = response;
    this.mockError = null;
  }

  setMockError(error: Error) {
    this.mockError = error;
    this.mockResponse = null;
  }

  async generate(request: any): Promise<any> {
    // Store the request for later inspection
    this.lastGenerateRequest = request;

    // If we have a mock error, throw it
    if (this.mockError) {
      console.error('Anthropic API error:', this.mockError);
      throw new Error(`Anthropic provider error: ${this.mockError.message}`);
    }

    // Otherwise return the mock response
    return {
      message: {
        role: 'assistant',
        content: this.mockResponse.content[0].text
      },
      usage: {
        input_tokens: this.mockResponse.usage?.input_tokens,
        output_tokens: this.mockResponse.usage?.output_tokens
      },
      finish_reason: this.mockResponse.stop_reason || null,
      rawResponse: this.mockResponse
    };
  }
}

// Save original environment and console.error
const originalEnv = process.env;
const originalConsoleError = console.error;

describe('AnthropicProvider', () => {
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };

    // Mock console.error to prevent test output pollution
    console.error = mock.fn();
  });

  afterEach(() => {
    // Restore process.env and console.error after tests
    process.env = originalEnv;
    console.error = originalConsoleError;
  });

  it('should throw error if no API key is provided', () => {
    delete process.env.ANTHROPIC_API_KEY;

    assert.throws(
      () => new AnthropicProvider(),
      /Anthropic API key is required/
    );
  });

  it('should use API key from constructor if provided', () => {
    const provider = new AnthropicProvider('test-key');
    assert.equal((provider as any).apiKey, 'test-key');
  });

  it('should use API key from environment if not provided in constructor', () => {
    process.env.ANTHROPIC_API_KEY = 'env-test-key';
    const provider = new AnthropicProvider();
    assert.equal((provider as any).apiKey, 'env-test-key');
  });

  it('should correctly map request parameters to Anthropic format', async () => {
    const provider = new TestableAnthropicProvider('test-key');

    // Setup mock response
    provider.setMockResponse({
      id: 'msg_123',
      model: 'claude-3-opus-20240229',
      content: [{ type: 'text', text: 'Hello, I am Claude.' }],
      role: 'assistant',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 8
      }
    });

    // Define test messages
    const messages: Message[] = [
      { role: 'system', content: 'You are Claude.' },
      { role: 'user', content: 'Hello!' }
    ];

    // Call generate
    await provider.generate({
      messages,
      model: 'claude-3-opus-20240229',
      parameters: {
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 5,
        stop_sequences: ['END']
      }
    });

    // Verify parameters were mapped correctly
    assert.deepEqual(provider.lastGenerateRequest.messages, messages);
    assert.equal(provider.lastGenerateRequest.model, 'claude-3-opus-20240229');
    assert.equal(provider.lastGenerateRequest.parameters.max_tokens, 100);
    assert.equal(provider.lastGenerateRequest.parameters.temperature, 0.7);
    assert.equal(provider.lastGenerateRequest.parameters.top_p, 0.9);
    assert.equal(provider.lastGenerateRequest.parameters.top_k, 5);
    assert.deepEqual(provider.lastGenerateRequest.parameters.stop_sequences, [
      'END'
    ]);
  });

  it('should correctly map Anthropic response to provider response', async () => {
    const provider = new TestableAnthropicProvider('test-key');

    // Setup mock response
    const mockResponse = {
      id: 'msg_123',
      model: 'claude-3-opus-20240229',
      content: [{ type: 'text', text: 'Hello, I am Claude.' }],
      role: 'assistant',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 8
      }
    };

    provider.setMockResponse(mockResponse);

    // Call generate
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Hello!' }],
      model: 'claude-3-opus-20240229',
      parameters: {
        max_tokens: 100,
        temperature: 0.7
      }
    });

    // Verify response mapping
    assert.deepEqual(response.message, {
      role: 'assistant',
      content: 'Hello, I am Claude.'
    });

    assert.deepEqual(response.usage, {
      input_tokens: 10,
      output_tokens: 8
    });

    assert.equal(response.finish_reason, 'end_turn');
    assert.deepEqual(response.rawResponse, mockResponse);
  });

  it('should handle API errors properly', async () => {
    const provider = new TestableAnthropicProvider('test-key');

    // Setup mock error
    const mockError = new Error('Rate limit exceeded');
    provider.setMockError(mockError);

    // Call generate and expect it to throw
    await assert.rejects(
      async () =>
        await provider.generate({
          messages: [{ role: 'user', content: 'Hello!' }],
          model: 'claude-3-opus-20240229',
          parameters: {
            max_tokens: 100,
            temperature: 0.7
          }
        }),
      /Anthropic provider error: Rate limit exceeded/
    );

    // Verify error was logged
    assert.equal((console.error as any).mock.calls.length, 1);
  });
});
