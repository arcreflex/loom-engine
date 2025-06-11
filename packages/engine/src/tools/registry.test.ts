import { describe, it, mock } from 'node:test';
import { strict as assert } from 'node:assert';
import { ToolRegistry } from './registry.ts';

describe('ToolRegistry', () => {
  it('should register and execute a tool correctly', async () => {
    const registry = new ToolRegistry();

    const mockHandler = mock.fn(async (args: object) => {
      const { message } = args as { message: string };
      return JSON.stringify({ result: `Hello, ${message}!` });
    });

    registry.register(
      'greet',
      'Greets the user with a message',
      {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to greet with' }
        },
        required: ['message']
      },
      mockHandler
    );

    const result = await registry.execute('greet', { message: 'World' });

    assert.equal(result, JSON.stringify({ result: 'Hello, World!' }));
    assert.equal(mockHandler.mock.callCount(), 1);
    assert.deepEqual(mockHandler.mock.calls[0].arguments[0], {
      message: 'World'
    });
  });

  it('should list tools without handlers', () => {
    const registry = new ToolRegistry();

    registry.register(
      'test_tool',
      'A test tool',
      { type: 'object', properties: {} },
      async () => 'test result'
    );

    const tools = registry.list();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, 'test_tool');
    assert.equal(tools[0].description, 'A test tool');
    assert.equal(typeof tools[0].parameters, 'object');
    assert.equal('handler' in tools[0], false);
  });

  it('should throw error when executing non-existent tool', async () => {
    const registry = new ToolRegistry();

    await assert.rejects(
      async () => await registry.execute('nonexistent', {}),
      { message: 'Tool "nonexistent" not found.' }
    );
  });

  it('should return undefined when getting non-existent tool', () => {
    const registry = new ToolRegistry();

    const tool = registry.get('nonexistent');
    assert.equal(tool, undefined);
  });
});
