import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMessagesToV2,
  toolCallsToToolUseBlocks,
  v2ToLegacyMessage,
  extractTextContent,
  extractToolUseBlocks
} from './provider-utils.ts';
import { ToolArgumentParseError } from '../content-blocks.ts';
import {
  UnexpectedToolCallTypeError,
  InvalidAssistantMessageError,
  MissingMessageContentError,
  MalformedToolMessageError
} from './errors.ts';
import type { Message, MessageV2, NonEmptyArray } from '../types.ts';

describe('provider-utils', () => {
  describe('normalizeMessagesToV2', () => {
    it('handles mixed legacy and V2 messages correctly', () => {
      const mixedMessages: (Message | MessageV2)[] = [
        // Legacy message
        {
          role: 'user',
          content: 'Hello'
        },
        // V2 message
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }] as NonEmptyArray<any>
        },
        // Another legacy message
        {
          role: 'user',
          content: 'How are you?'
        }
      ];

      const result = normalizeMessagesToV2(mixedMessages as any);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].role, 'user');
      assert.strictEqual(result[0].content[0].type, 'text');
      assert.strictEqual((result[0].content[0] as any).text, 'Hello');

      assert.strictEqual(result[1].role, 'assistant');
      assert.strictEqual(result[1].content[0].type, 'text');
      assert.strictEqual((result[1].content[0] as any).text, 'Hi there');

      assert.strictEqual(result[2].role, 'user');
      assert.strictEqual(result[2].content[0].type, 'text');
      assert.strictEqual((result[2].content[0] as any).text, 'How are you?');
    });
  });

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
  });

  describe('v2ToLegacyMessage', () => {
    it('throws error for tool message with no text content', () => {
      const toolMessage: MessageV2 = {
        role: 'tool',
        content: [] as any, // Invalid empty content
        tool_call_id: 'call_123'
      };

      assert.throws(
        () => v2ToLegacyMessage(toolMessage),
        (error: any) => {
          assert(error instanceof MalformedToolMessageError);
          assert(error.message.includes('Tool message must have text content'));
          assert(error.message.includes('call_123'));
          return true;
        }
      );
    });

    it('successfully converts tool message with text content', () => {
      const toolMessage: MessageV2 = {
        role: 'tool',
        content: [{ type: 'text', text: 'Tool result' }] as NonEmptyArray<any>,
        tool_call_id: 'call_123'
      };

      const result = v2ToLegacyMessage(toolMessage);

      assert.strictEqual(result.role, 'tool');
      assert.strictEqual(result.content, 'Tool result');
      assert.strictEqual((result as any).tool_call_id, 'call_123');
    });
  });

  describe('normalizeMessagesToV2 edge cases', () => {
    it('handles empty message array', () => {
      const result = normalizeMessagesToV2([]);
      assert.strictEqual(result.length, 0);
    });

    it('enforces role-specific content constraints', () => {
      // Test that user messages get normalized to text-only
      const userWithToolCalls = {
        role: 'user',
        content: 'Hello',
        tool_calls: [
          {
            /* tool call data */
          }
        ]
      };

      const normalized = normalizeMessagesToV2([userWithToolCalls as any]);
      assert.strictEqual(normalized[0].role, 'user');
      assert.strictEqual(normalized[0].content.length, 1);
      assert.strictEqual(normalized[0].content[0].type, 'text');
    });

    it('handles deeply nested mixed arrays correctly', () => {
      const messages = [
        { role: 'user', content: 'Start' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'V2 message' }] as NonEmptyArray<any>
        },
        { role: 'user', content: 'Middle' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'test', arguments: '{}' }
            }
          ]
        },
        { role: 'tool', content: 'Result', tool_call_id: 'tc1' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Final' },
            { type: 'tool-use', id: 'tc2', name: 'end', parameters: {} }
          ] as NonEmptyArray<any>
        }
      ];

      const result = normalizeMessagesToV2(messages as any);

      assert.strictEqual(result.length, 6);
      // Verify each message was normalized correctly
      assert.strictEqual(result[0].content[0].type, 'text');
      assert.strictEqual(result[1].content[0].type, 'text');
      assert.strictEqual(result[2].content[0].type, 'text');
      assert.strictEqual(result[3].content[0].type, 'tool-use');
      assert.strictEqual(result[4].content[0].type, 'text');
      assert.strictEqual(result[5].content.length, 2);
    });

    it('preserves V2 messages that are already normalized', () => {
      const v2Messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }] as NonEmptyArray<any>
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hi' },
            { type: 'tool-use', id: 'x', name: 'y', parameters: {} }
          ] as NonEmptyArray<any>
        }
      ];

      const result = normalizeMessagesToV2(v2Messages as any);

      // Should be identical references since already V2
      assert.strictEqual(result[0], v2Messages[0]);
      assert.strictEqual(result[1], v2Messages[1]);
    });
  });

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

  describe('v2ToLegacyMessage edge cases', () => {
    it('throws error for user message with no text content', () => {
      const userMessage: MessageV2 = {
        role: 'user',
        content: [] as any // Invalid empty content
      };

      assert.throws(
        () => v2ToLegacyMessage(userMessage),
        (error: any) => {
          assert(error instanceof MissingMessageContentError);
          assert(error.message.includes('User'));
          return true;
        }
      );
    });

    it('throws error for assistant message with no content', () => {
      const assistantMessage: MessageV2 = {
        role: 'assistant',
        content: [] as any // Invalid empty content
      };

      assert.throws(
        () => v2ToLegacyMessage(assistantMessage),
        (error: any) => {
          assert(error instanceof InvalidAssistantMessageError);
          return true;
        }
      );
    });
  });
});
