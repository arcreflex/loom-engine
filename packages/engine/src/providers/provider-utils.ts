import type {
  Message,
  MessageV2,
  ContentBlock,
  TextBlock,
  ToolUseBlock
} from '../types.ts';
import {
  normalizeMessage,
  isMessageV2,
  ToolArgumentParseError
} from '../content-blocks.ts';
import { UnexpectedToolCallTypeError } from './errors.ts';
import { v2ToLegacyMessage } from '../content-blocks-convert.ts';

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
export function extractTextContent(blocks: ContentBlock[]): string | null {
  const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text');
  if (textBlocks.length === 0) return null;
  // Join with newline to preserve formatting (code blocks, paragraphs, etc.)
  return textBlocks.map(b => b.text).join('\n');
}

/**
 * Extracts tool-use blocks from ContentBlock array.
 * Returns undefined if no tool-use blocks are present.
 */
export function extractToolUseBlocks(
  blocks: ContentBlock[]
): ToolUseBlock[] | undefined {
  const toolBlocks = blocks.filter(
    (b): b is ToolUseBlock => b.type === 'tool-use'
  );
  return toolBlocks.length > 0 ? toolBlocks : undefined;
}

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
      parameters = JSON.parse(tc.function.arguments);
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
