import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toolCallsToToolUseBlocks,
  extractTextContent,
  extractToolUseBlocks
} from './provider-utils.ts';
import { ToolArgumentParseError } from '../content-blocks.ts';
import { UnexpectedToolCallTypeError } from './errors.ts';
//

describe('provider-utils', () => {
  // Normalization helper tests removed; adapters accept V2-only inputs now.

  describe('toolCallsToToolUseBlocks', () => {
    it('throws ToolArgumentParseError for invalid JSON arguments', () => {
      const toolCalls = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: 'not valid json {'
          }
        }
      ];

      assert.throws(
        () => toolCallsToToolUseBlocks(toolCalls),
        (error: any) => {
          assert(error instanceof ToolArgumentParseError);
          assert.strictEqual(error.toolCallId, 'call_123');
          assert.strictEqual(error.toolName, 'test_tool');
          assert.strictEqual(error.rawArguments, 'not valid json {');
          return true;
        }
      );
    });

    it('successfully converts valid tool calls', () => {
      const toolCalls = [
        {
          id: 'call_456',
          type: 'function',
          function: {
            name: 'echo',
            arguments: '{"message": "test"}'
          }
        }
      ];

      const result = toolCallsToToolUseBlocks(toolCalls);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'tool-use');
      assert.strictEqual(result[0].id, 'call_456');
      assert.strictEqual(result[0].name, 'echo');
      assert.deepStrictEqual(result[0].parameters, { message: 'test' });
    });

    it('throws error when tool arguments parse but are not an object', () => {
      const cases = ['"a string"', '42', 'true', 'null', '[1,2,3]'];

      for (const arg of cases) {
        const toolCalls = [
          {
            id: 'call_x',
            type: 'function',
            function: { name: 'test', arguments: arg }
          }
        ];

        assert.throws(
          () => toolCallsToToolUseBlocks(toolCalls),
          (error: any) => {
            assert(error instanceof ToolArgumentParseError);
            // Ensure rawArguments echo back the input (possibly truncated), not empty
            assert.ok(typeof error.rawArguments === 'string');
            assert.ok(error.rawArguments.length > 0);
            return true;
          }
        );
      }
    });

    it('truncates long arguments in error message', () => {
      const longInvalidJson = 'x'.repeat(150);
      const toolCalls = [
        {
          id: 'call_789',
          type: 'function',
          function: {
            name: 'test',
            arguments: longInvalidJson
          }
        }
      ];

      assert.throws(
        () => toolCallsToToolUseBlocks(toolCalls),
        (error: any) => {
          assert(error instanceof ToolArgumentParseError);
          assert.strictEqual(error.rawArguments.length, 103); // 100 chars + '...'
          assert(error.rawArguments.endsWith('...'));
          return true;
        }
      );
    });

    it('throws error for non-function tool call type', () => {
      const toolCalls = [
        {
          id: 'call_123',
          type: 'other_type', // Invalid type
          function: {
            name: 'test',
            arguments: '{}'
          }
        }
      ];

      assert.throws(
        () => toolCallsToToolUseBlocks(toolCalls),
        (error: any) => {
          assert(error instanceof UnexpectedToolCallTypeError);
          assert(error.message.includes("'other_type'"));
          assert(error.message.includes("'function'"));
          return true;
        }
      );
    });

    it('preserves order of multiple tool calls', () => {
      const toolCalls = [
        {
          id: 'a',
          type: 'function',
          function: { name: 'first', arguments: '{"x":1}' }
        },
        {
          id: 'b',
          type: 'function',
          function: { name: 'second', arguments: '{"y":2}' }
        },
        {
          id: 'c',
          type: 'function',
          function: { name: 'third', arguments: '{"z":3}' }
        }
      ];

      const blocks = toolCallsToToolUseBlocks(toolCalls);
      assert.strictEqual(blocks.length, 3);
      assert.deepStrictEqual(
        blocks.map(b => [b.id, b.name]),
        [
          ['a', 'first'],
          ['b', 'second'],
          ['c', 'third']
        ]
      );
    });
  });

  // Legacy conversion tests removed; conversion is handled internally where needed.

  // Normalization edge cases removed.

  describe('content block ordering', () => {
    it('preserves order when extracting from mixed content blocks', () => {
      const blocks = [
        { type: 'text' as const, text: 'First text' },
        {
          type: 'tool-use' as const,
          id: 'tool1',
          name: 'func1',
          parameters: {}
        },
        { type: 'text' as const, text: 'Second text' },
        {
          type: 'tool-use' as const,
          id: 'tool2',
          name: 'func2',
          parameters: {}
        }
      ];

      const textContent = extractTextContent(blocks);
      const toolBlocks = extractToolUseBlocks(blocks);

      // Text content should be concatenated with newline to preserve formatting
      assert.strictEqual(textContent, 'First text\nSecond text');

      // Tool blocks should be in order
      assert.strictEqual(toolBlocks?.length, 2);
      assert.strictEqual(toolBlocks?.[0].id, 'tool1');
      assert.strictEqual(toolBlocks?.[1].id, 'tool2');
    });

    it('preserves formatting with newline joining', () => {
      const blocks = [
        { type: 'text' as const, text: 'function hello() {' },
        { type: 'text' as const, text: '  return "world";' },
        { type: 'text' as const, text: '}' }
      ];

      const textContent = extractTextContent(blocks);
      // Should join with newlines to preserve code formatting
      assert.strictEqual(
        textContent,
        'function hello() {\n  return "world";\n}'
      );
    });
  });

  // Legacy conversion edge cases removed.
});
