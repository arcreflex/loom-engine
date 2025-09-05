import type { Message, MessageV2, ToolUseBlock } from '../types.ts';
import {
  normalizeMessage,
  isMessageV2,
  ToolArgumentParseError
} from '../content-blocks.ts';
import { UnexpectedToolCallTypeError } from './errors.ts';
import {
  v2ToLegacyMessage,
  extractTextContent,
  extractToolUseBlocks
} from '../content-blocks-convert.ts';

/**
 * Converts a message array to V2 format, handling both legacy and V2 inputs.
 * This is used by providers to ensure they work with the V2 format internally.
 * Handles mixed arrays where some messages may be V2 and others legacy.
 */
export function normalizeMessagesToV2(
  messages: Message[] | MessageV2[]
): MessageV2[] {
  if (messages.length === 0) return [];

  // Normalize each message individually to handle mixed arrays
  return messages.map(msg => {
    if (isMessageV2(msg)) {
      return msg as MessageV2;
    }
    return normalizeMessage(msg as Message);
  });
}

/**
 * Extracts text content from ContentBlock array.
 * Returns null if no text blocks are present.
 * Note: Multiple text blocks are joined with newline to preserve formatting.
 * User and tool messages should ideally contain only a single text block.
 * Assistant messages may have multiple text blocks interspersed with tool-use blocks.
 */
export { extractTextContent, extractToolUseBlocks };

/**
 * Converts tool calls from OpenAI format to ToolUseBlock format.
 * @throws {ToolArgumentParseError} if tool arguments cannot be parsed as JSON
 */
export function toolCallsToToolUseBlocks(
  toolCalls: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>
): ToolUseBlock[] {
  return toolCalls.map(tc => {
    // OpenAI always uses type: 'function' for tool calls
    if (tc.type !== 'function') {
      throw new UnexpectedToolCallTypeError(tc.type, 'function');
    }

    let parameters: Record<string, unknown>;
    try {
      const parsed = JSON.parse(tc.function.arguments);
      // Ensure parsed value is a plain object, not null/array/primitive
      const isPlainObject =
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.getPrototypeOf(parsed) === Object.prototype;
      if (!isPlainObject) {
        throw new Error('Expected tool arguments to be a JSON object');
      }
      parameters = parsed as Record<string, unknown>;
    } catch (error) {
      // Throw ToolArgumentParseError with truncated arguments for context
      const truncatedArgs =
        tc.function.arguments.length > 100
          ? tc.function.arguments.substring(0, 100) + '...'
          : tc.function.arguments;
      throw new ToolArgumentParseError(
        tc.id,
        tc.function.name,
        truncatedArgs,
        error as Error
      );
    }

    return {
      type: 'tool-use' as const,
      id: tc.id,
      name: tc.function.name,
      parameters
    };
  });
}

/**
 * Converts a V2 message back to legacy format for backward compatibility.
 * This is a temporary conversion during the migration period.
 * @throws {Error} if tool message has no text content
 */
export { v2ToLegacyMessage };
