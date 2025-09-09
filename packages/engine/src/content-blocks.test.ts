import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  AssistantMessageLegacy,
  MessageLegacy,
  ToolMessageLegacy,
  UserMessage,
  TextBlock,
  NonEmptyArray
} from './types.ts';
import {
  legacyToContentBlocks,
  normalizeMessage,
  isMessageV2,
  isContentBlock,
  ToolArgumentParseError
} from './content-blocks.ts';

describe('content-block conversion utilities', () => {
  describe('isContentBlock', () => {
    it('validates text blocks', () => {
      assert.ok(isContentBlock({ type: 'text', text: 'hello' }));
      assert.ok(!isContentBlock({ type: 'text' })); // missing text
      assert.ok(!isContentBlock({ type: 'text', text: 123 })); // wrong type
    });

    it('validates tool-use blocks with correct parameters type', () => {
      assert.ok(
        isContentBlock({
          type: 'tool-use',
          id: 'id-1',
          name: 'tool',
          parameters: { key: 'value' }
        })
      );

      // Reject null parameters
      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: 'id-1',
          name: 'tool',
          parameters: null
        })
      );

      // Reject array parameters
      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: 'id-1',
          name: 'tool',
          parameters: []
        })
      );

      // Reject missing parameters
      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: 'id-1',
          name: 'tool'
        })
      );
    });

    it('rejects tool-use blocks with empty or whitespace-only id', () => {
      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: '',
          name: 'tool',
          parameters: {}
        })
      );

      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: '   ',
          name: 'tool',
          parameters: {}
        })
      );
    });

    it('rejects tool-use blocks with empty or whitespace-only name', () => {
      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: 'id-1',
          name: '',
          parameters: {}
        })
      );

      assert.ok(
        !isContentBlock({
          type: 'tool-use',
          id: 'id-1',
          name: '  \t\n  ',
          parameters: {}
        })
      );
    });
  });

  describe('isMessageV2', () => {
    it('enforces non-empty content arrays', () => {
      assert.ok(!isMessageV2({ role: 'user', content: [] }));
      assert.ok(!isMessageV2({ role: 'assistant', content: [] }));
      assert.ok(
        !isMessageV2({ role: 'tool', content: [], tool_call_id: 'id' })
      );
    });

    it('validates tool messages require tool_call_id', () => {
      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [{ type: 'text', text: 'result' }]
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [{ type: 'text', text: 'result' }],
          tool_call_id: ''
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [{ type: 'text', text: 'result' }],
          tool_call_id: '   '
        })
      );

      assert.ok(
        isMessageV2({
          role: 'tool',
          content: [{ type: 'text', text: 'result' }],
          tool_call_id: 'call-1'
        })
      );
    });

    it('rejects tool messages with empty-text TextBlocks', () => {
      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [{ type: 'text', text: '' }],
          tool_call_id: 'call-1'
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [{ type: 'text', text: '   ' }],
          tool_call_id: 'call-1'
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [
            { type: 'text', text: 'valid' },
            { type: 'text', text: '' }
          ],
          tool_call_id: 'call-1'
        })
      );
    });

    it('rejects user messages with empty-text TextBlocks', () => {
      assert.ok(
        !isMessageV2({
          role: 'user',
          content: [{ type: 'text', text: '' }]
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'user',
          content: [{ type: 'text', text: '  \n\t  ' }]
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'user',
          content: [
            { type: 'text', text: 'valid' },
            { type: 'text', text: '   ' }
          ]
        })
      );
    });

    it('enforces tool messages can only contain text blocks', () => {
      assert.ok(
        !isMessageV2({
          role: 'tool',
          content: [
            {
              type: 'tool-use',
              id: 'id',
              name: 'tool',
              parameters: {}
            }
          ],
          tool_call_id: 'call-1'
        })
      );
    });

    it('enforces user messages cannot contain tool-use blocks', () => {
      assert.ok(
        !isMessageV2({
          role: 'user',
          content: [
            {
              type: 'tool-use',
              id: 'id',
              name: 'tool',
              parameters: {}
            }
          ]
        })
      );

      assert.ok(
        isMessageV2({
          role: 'user',
          content: [{ type: 'text', text: 'hello' }]
        })
      );
    });

    it('allows assistant messages with text and tool-use blocks', () => {
      assert.ok(
        isMessageV2({
          role: 'assistant',
          content: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool-use', id: 'id', name: 'calc', parameters: { x: 1 } }
          ]
        })
      );
    });

    it('rejects assistant messages with empty-text TextBlocks', () => {
      assert.ok(
        !isMessageV2({
          role: 'assistant',
          content: [{ type: 'text', text: '' }]
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'assistant',
          content: [{ type: 'text', text: '   ' }]
        })
      );

      assert.ok(
        !isMessageV2({
          role: 'assistant',
          content: [
            { type: 'text', text: 'valid' },
            { type: 'text', text: '' }
          ]
        })
      );

      // Assistant with mix of valid tool and empty text
      assert.ok(
        !isMessageV2({
          role: 'assistant',
          content: [
            { type: 'tool-use', id: 'id', name: 'calc', parameters: { x: 1 } },
            { type: 'text', text: '  ' }
          ]
        })
      );
    });
  });

  describe('legacyToContentBlocks', () => {
    it('throws for tool messages', () => {
      const toolMsg: ToolMessageLegacy = {
        role: 'tool',
        content: 'result',
        tool_call_id: 'call-1'
      };
      assert.throws(
        () => legacyToContentBlocks(toolMsg),
        /legacyToContentBlocks does not handle tool messages/
      );
    });

    it('converts legacy user message with text to a single text block', () => {
      const legacy: MessageLegacy = { role: 'user', content: 'Hello' };
      const blocks = legacyToContentBlocks(legacy);
      assert.equal(blocks.length, 1);
      assert.deepEqual(blocks[0], { type: 'text', text: 'Hello' });
    });

    it('converts legacy assistant message with text and tool_calls to ordered blocks', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'Run a calc',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'calc', arguments: '{"x":2, "y":3}' }
          }
        ]
      };
      const blocks = legacyToContentBlocks(legacy);
      assert.equal(blocks.length, 2);
      assert.deepEqual(blocks[0], { type: 'text', text: 'Run a calc' });
      assert.deepEqual(blocks[1], {
        type: 'tool-use',
        id: 'call-1',
        name: 'calc',
        parameters: { x: 2, y: 3 }
      });
    });

    it('throws ToolArgumentParseError for invalid JSON tool args', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'echo', arguments: 'not-json' }
          }
        ]
      };

      assert.throws(
        () => legacyToContentBlocks(legacy),
        (err: unknown) => {
          assert.ok(err instanceof ToolArgumentParseError);
          const parseErr = err as ToolArgumentParseError;
          assert.equal(parseErr.toolCallId, 'call-2');
          assert.equal(parseErr.toolName, 'echo');
          assert.equal(parseErr.rawArguments, 'not-json');
          // Check that cause is set to the original parse error
          assert.ok('cause' in parseErr);
          assert.ok((parseErr as any).cause instanceof Error);
          return true;
        }
      );
    });

    it('allows empty string tool arguments as empty object', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'test',
        tool_calls: [
          {
            id: 'call-3',
            type: 'function',
            function: { name: 'void', arguments: '' }
          }
        ]
      };
      const blocks = legacyToContentBlocks(legacy);
      assert.deepEqual(blocks[1], {
        type: 'tool-use',
        id: 'call-3',
        name: 'void',
        parameters: {}
      });
    });

    it('treats whitespace-only tool arguments as empty object', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'test',
        tool_calls: [
          {
            id: 'call-ws',
            type: 'function',
            function: { name: 'void', arguments: '   \n\t  ' }
          }
        ]
      };
      const blocks = legacyToContentBlocks(legacy);
      assert.deepEqual(blocks[1], {
        type: 'tool-use',
        id: 'call-ws',
        name: 'void',
        parameters: {}
      });
    });

    it('throws for empty content with no tool calls', () => {
      const legacy: MessageLegacy = { role: 'user', content: '' };
      assert.throws(
        () => legacyToContentBlocks(legacy),
        /Cannot convert legacy user message to V2: no content blocks generated/
      );

      const assistantEmpty: AssistantMessageLegacy = {
        role: 'assistant',
        content: null,
        tool_calls: []
      };
      assert.throws(
        () => legacyToContentBlocks(assistantEmpty),
        /Cannot convert legacy assistant message to V2: no content blocks generated/
      );
    });

    it('treats whitespace-only content as empty and throws', () => {
      const userWhitespace: MessageLegacy = {
        role: 'user',
        content: '   \n\t  '
      };
      assert.throws(
        () => legacyToContentBlocks(userWhitespace),
        /Cannot convert legacy user message to V2: no content blocks generated/
      );

      const toolWhitespace: ToolMessageLegacy = {
        role: 'tool',
        content: '  \t  ',
        tool_call_id: 'call-1'
      };
      assert.throws(
        () => normalizeMessage(toolWhitespace),
        /Cannot normalize tool message with empty content/
      );
    });

    it('converts assistant with only tool_calls and null content', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-4',
            type: 'function',
            function: { name: 'test', arguments: '{}' }
          }
        ]
      };
      const blocks = legacyToContentBlocks(legacy);
      assert.equal(blocks.length, 1);
      assert.equal(blocks[0].type, 'tool-use');
    });

    it('throws ToolArgumentParseError for tool arguments that are arrays', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-5',
            type: 'function',
            function: { name: 'bad', arguments: '[1, 2, 3]' }
          }
        ]
      };
      assert.throws(
        () => legacyToContentBlocks(legacy),
        (err: unknown) => {
          assert.ok(err instanceof ToolArgumentParseError);
          const parseErr = err as ToolArgumentParseError;
          assert.equal(parseErr.toolCallId, 'call-5');
          assert.equal(parseErr.toolName, 'bad');
          assert.ok(parseErr.message.includes('Expected plain object'));
          return true;
        }
      );
    });

    it('preserves original text while rejecting empty after trim', () => {
      const legacy: MessageLegacy = { role: 'user', content: '  Hello  ' };
      const blocks = legacyToContentBlocks(legacy);
      assert.equal(blocks.length, 1);
      // Original content is preserved (with whitespace)
      assert.deepEqual(blocks[0], { type: 'text', text: '  Hello  ' });
    });

    it('handles assistant with whitespace-only content and valid tool_calls', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: '   ',
        tool_calls: [
          {
            id: 'call-ws',
            type: 'function',
            function: { name: 'test', arguments: '{}' }
          }
        ]
      };
      const blocks = legacyToContentBlocks(legacy);
      // Should only have tool-use block, no text block
      assert.equal(blocks.length, 1);
      assert.equal(blocks[0].type, 'tool-use');
    });

    it('throws for tool calls with empty id', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'test',
        tool_calls: [
          {
            id: '',
            type: 'function',
            function: { name: 'test', arguments: '{}' }
          }
        ]
      };
      assert.throws(
        () => legacyToContentBlocks(legacy),
        /Tool call must have a non-empty id/
      );
    });

    it('throws for tool calls with whitespace-only name', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'test',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: '  ', arguments: '{}' }
          }
        ]
      };
      assert.throws(
        () => legacyToContentBlocks(legacy),
        /Tool call must have a non-empty name/
      );
    });

    it('throws ToolArgumentParseError for tool arguments that are null', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-6',
            type: 'function',
            function: { name: 'bad', arguments: 'null' }
          }
        ]
      };
      assert.throws(
        () => legacyToContentBlocks(legacy),
        (err: unknown) => {
          assert.ok(err instanceof ToolArgumentParseError);
          const parseErr = err as ToolArgumentParseError;
          assert.equal(parseErr.toolCallId, 'call-6');
          assert.equal(parseErr.toolName, 'bad');
          assert.ok(parseErr.message.includes('Expected plain object'));
          return true;
        }
      );
    });
  });

  describe('normalizeMessage', () => {
    it('returns V2 messages unchanged if valid', () => {
      const v2: UserMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }] as NonEmptyArray<TextBlock>
      };
      assert.strictEqual(normalizeMessage(v2), v2);
    });

    it('normalizes legacy tool message to V2 with text block and tool_call_id', () => {
      const legacy: ToolMessageLegacy = {
        role: 'tool',
        content: '42',
        tool_call_id: 'call-1'
      };
      const v2 = normalizeMessage(legacy);
      assert.ok(isMessageV2(v2));
      assert.equal(v2.role, 'tool');
      assert.equal((v2 as any).tool_call_id, 'call-1');
      assert.deepEqual(v2.content, [{ type: 'text', text: '42' }]);
    });

    it('throws for tool message with empty content', () => {
      const legacy: ToolMessageLegacy = {
        role: 'tool',
        content: '',
        tool_call_id: 'call-1'
      };
      assert.throws(
        () => normalizeMessage(legacy),
        /Cannot normalize tool message with empty content/
      );
    });

    it('throws for tool message with whitespace-only content', () => {
      const legacy: ToolMessageLegacy = {
        role: 'tool',
        content: '   \n\t  ',
        tool_call_id: 'call-1'
      };
      assert.throws(
        () => normalizeMessage(legacy),
        /Cannot normalize tool message with empty content/
      );
    });

    it('throws for tool message without tool_call_id', () => {
      const legacy = {
        role: 'tool' as const,
        content: 'result',
        tool_call_id: ''
      };
      assert.throws(
        () => normalizeMessage(legacy),
        /Tool message must have a non-empty tool_call_id/
      );

      const whitespaceId = {
        role: 'tool' as const,
        content: 'result',
        tool_call_id: '   '
      };
      assert.throws(
        () => normalizeMessage(whitespaceId),
        /Tool message must have a non-empty tool_call_id/
      );
    });

    it('throws for user message with empty content', () => {
      const legacy: MessageLegacy = { role: 'user', content: '' };
      assert.throws(
        () => normalizeMessage(legacy),
        /Cannot convert legacy user message to V2: no content blocks generated/
      );

      const whitespace: MessageLegacy = { role: 'user', content: '  \t\n  ' };
      assert.throws(
        () => normalizeMessage(whitespace),
        /Cannot convert legacy user message to V2: no content blocks generated/
      );
    });

    it('throws for assistant message with empty content and no tool calls', () => {
      const emptyAssistant: AssistantMessageLegacy = {
        role: 'assistant',
        content: '',
        tool_calls: []
      };
      assert.throws(
        () => normalizeMessage(emptyAssistant),
        /Cannot convert legacy assistant message to V2: no content blocks generated/
      );

      const whitespaceAssistant: AssistantMessageLegacy = {
        role: 'assistant',
        content: '   ',
        tool_calls: []
      };
      assert.throws(
        () => normalizeMessage(whitespaceAssistant),
        /Cannot convert legacy assistant message to V2: no content blocks generated/
      );
    });

    it('propagates ToolArgumentParseError from legacyToContentBlocks', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'test',
        tool_calls: [
          {
            id: 'call-7',
            type: 'function',
            function: { name: 'bad', arguments: 'invalid-json' }
          }
        ]
      };
      assert.throws(() => normalizeMessage(legacy), ToolArgumentParseError);
    });

    it('validates normalized messages against isMessageV2', () => {
      // This would only fail if our normalization logic creates invalid V2
      const validUser: MessageLegacy = { role: 'user', content: 'test' };
      const normalizedUser = normalizeMessage(validUser);
      assert.ok(isMessageV2(normalizedUser));

      const validAssistant: AssistantMessageLegacy = {
        role: 'assistant',
        content: 'response',
        tool_calls: [
          {
            id: 'id',
            type: 'function',
            function: { name: 'tool', arguments: '{"key": "value"}' }
          }
        ]
      };
      const normalizedAssistant = normalizeMessage(validAssistant);
      assert.ok(isMessageV2(normalizedAssistant));
    });

    it('normalizes assistant legacy message with null content and only tool_calls', () => {
      const legacy: AssistantMessageLegacy = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-8',
            type: 'function',
            function: { name: 'test', arguments: '{"foo": "bar"}' }
          }
        ]
      };
      const v2 = normalizeMessage(legacy);
      assert.ok(isMessageV2(v2));
      assert.equal(v2.role, 'assistant');
      assert.equal(v2.content.length, 1);
      assert.equal(v2.content[0].type, 'tool-use');
    });

    it('throws for malformed V2 tool message with non-string content', () => {
      const malformed = {
        role: 'tool' as const,
        content: ['array', 'content'] as any,
        tool_call_id: 'call-1'
      };
      assert.throws(
        () => normalizeMessage(malformed),
        /Tool message content must be a string/
      );
    });
  });
});
