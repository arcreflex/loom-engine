import type {
  ContentBlock,
  Message,
  LegacyMessage,
  LegacyAssistantMessage,
  LegacyToolMessage,
  AssistantMessage,
  ToolMessage,
  UserMessage,
  ToolUseBlock,
  NonEmptyArray,
  TextBlock
} from './types.ts';

/**
 * Type guard for TextBlock
 * @param requireNonEmpty - If true, requires text to be non-empty after trimming
 */
export function isTextBlock(
  b: unknown,
  requireNonEmpty = false
): b is TextBlock {
  if (!b || typeof b !== 'object') return false;
  const obj = b as { type?: unknown; text?: unknown };

  const isValid = obj.type === 'text' && typeof obj.text === 'string';

  if (!isValid) return false;

  if (requireNonEmpty) {
    return (obj.text as string).trim().length > 0;
  }

  return true;
}

/**
 * Type guard for ToolUseBlock. Validates that parameters is a plain object (not null or array).
 * Requires non-empty, trimmed strings for id and name.
 */
export function isToolUseBlock(b: unknown): b is ToolUseBlock {
  if (!b || typeof b !== 'object') return false;
  const obj = b as {
    type?: unknown;
    id?: unknown;
    name?: unknown;
    parameters?: unknown;
  };

  return (
    obj.type === 'tool-use' &&
    typeof obj.id === 'string' &&
    obj.id.trim().length > 0 &&
    typeof obj.name === 'string' &&
    obj.name.trim().length > 0 &&
    obj.parameters !== null &&
    typeof obj.parameters === 'object' &&
    !Array.isArray(obj.parameters) &&
    Object.getPrototypeOf(obj.parameters) === Object.prototype
  );
}

/**
 * Type guard for TextBlock with non-empty text (after trimming).
 * This is a convenience function that combines isTextBlock with the requireNonEmpty flag.
 */
export function isNonEmptyTextBlock(b: unknown): b is TextBlock {
  return isTextBlock(b, true);
}

/**
 * Type guard for ContentBlock (TextBlock or ToolUseBlock).
 * Note: This accepts TextBlocks with empty text. Use isNonEmptyTextBlock if you need
 * to ensure non-empty text content.
 */
export function isContentBlock(b: unknown): b is ContentBlock {
  return isTextBlock(b) || isToolUseBlock(b);
}

/**
 * Type guard for NonEmptyArray
 */
function isNonEmptyArray<T>(
  arr: unknown,
  itemGuard: (item: unknown) => item is T
): arr is NonEmptyArray<T> {
  return Array.isArray(arr) && arr.length > 0 && arr.every(itemGuard);
}

/**
 * Type guard for Message (V2). Validates structure and enforces role-specific constraints:
 * - All messages must have non-empty content arrays
 * - Tool messages must have tool_call_id and only text blocks
 * - User messages must only contain text blocks
 * Note: This function performs validation but does not throw errors.
 */
export function isMessageV2(m: unknown): m is Message {
  if (!m || typeof m !== 'object') return false;

  const msg = m as {
    role?: unknown;
    content?: unknown;
    tool_call_id?: unknown;
  };
  const { role, content } = msg;

  // Validate role
  if (role !== 'user' && role !== 'assistant' && role !== 'tool') return false;

  // Content must be non-empty array
  if (!Array.isArray(content) || content.length === 0) return false;

  // Role-specific validation
  if (role === 'user') {
    // User messages must only contain text blocks with non-empty text
    return isNonEmptyArray(content, b => isTextBlock(b, true));
  }

  if (role === 'assistant') {
    // Assistant messages can contain tool-use blocks or non-empty text blocks
    return isNonEmptyArray(
      content,
      b => isToolUseBlock(b) || isTextBlock(b, true)
    );
  }

  if (role === 'tool') {
    // Tool messages must have tool_call_id and only text blocks with non-empty text
    if (
      typeof msg.tool_call_id !== 'string' ||
      msg.tool_call_id.trim().length === 0
    ) {
      return false;
    }
    return isNonEmptyArray(content, b => isTextBlock(b, true));
  }

  return false;
}

/**
 * Error thrown when tool arguments cannot be parsed as JSON
 */
export class ToolArgumentParseError extends Error {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly rawArguments: string;
  readonly parseError: Error;

  constructor(
    toolCallId: string,
    toolName: string,
    rawArguments: string,
    parseError: Error
  ) {
    super(
      `Failed to parse tool arguments for ${toolName} (${toolCallId}): ${parseError.message}`,
      { cause: parseError }
    );
    this.name = 'ToolArgumentParseError';
    this.toolCallId = toolCallId;
    this.toolName = toolName;
    this.rawArguments = rawArguments;
    this.parseError = parseError;
  }
}

/**
 * Helper to ensure a value is a plain object (not null, array, or other)
 */
function assertPlainObject(
  value: unknown
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error('Expected plain object');
  }
}

/**
 * Converts a legacy message to ContentBlock array.
 * Note: When both text content and tool_calls exist, text blocks are placed before
 * tool-use blocks. This is a canonicalization choice since the legacy format cannot
 * express interleaved text and tool-use content.
 * @throws {ToolArgumentParseError} if tool arguments cannot be parsed as JSON
 * @throws {Error} if the resulting content array would be empty
 */
export function legacyToContentBlocks(message: LegacyMessage): ContentBlock[] {
  // Tool messages should be handled separately in normalizeMessage
  if (message.role === 'tool') {
    throw new Error(
      'legacyToContentBlocks does not handle tool messages. Use normalizeMessage instead.'
    );
  }

  const blocks: ContentBlock[] = [];

  // Add text block if content is non-empty after trimming
  const trimmedContent = message.content?.trim();
  if (trimmedContent && trimmedContent.length > 0) {
    // Use original content to preserve formatting, but check trimmed version for emptiness
    blocks.push({ type: 'text', text: message.content || '' });
  }

  // Add tool-use blocks for assistant messages
  if (
    message.role === 'assistant' &&
    message.tool_calls &&
    message.tool_calls.length > 0
  ) {
    for (const tc of message.tool_calls) {
      // Validate tool call has required fields
      if (!tc.id || tc.id.trim().length === 0) {
        throw new Error(
          `Tool call must have a non-empty id (got: ${JSON.stringify(tc.id)})`
        );
      }
      if (!tc.function.name || tc.function.name.trim().length === 0) {
        throw new Error(
          `Tool call must have a non-empty name (got: ${JSON.stringify(
            tc.function.name
          )})`
        );
      }

      let parameters: Record<string, unknown>;

      // Trim arguments before checking emptiness
      const trimmedArgs = tc.function.arguments?.trim();
      if (!trimmedArgs || trimmedArgs === '') {
        // Empty or whitespace-only arguments default to empty object
        parameters = {};
      } else {
        // Parse JSON arguments
        try {
          const parsed = JSON.parse(trimmedArgs);
          assertPlainObject(parsed);
          parameters = parsed;
        } catch (error) {
          // Throw error for invalid JSON instead of silently wrapping
          throw new ToolArgumentParseError(
            tc.id,
            tc.function.name,
            tc.function.arguments,
            error as Error
          );
        }
      }

      blocks.push({
        type: 'tool-use',
        id: tc.id,
        name: tc.function.name,
        parameters
      });
    }
  }

  // Enforce non-empty invariant
  if (blocks.length === 0) {
    throw new Error(
      `Cannot convert legacy ${message.role} message to V2: no content blocks generated`
    );
  }

  return blocks;
}

/**
 * Normalizes a message to V2 format. If already V2, validates and returns it.
 * If legacy format, converts to V2.
 * @throws {Error} if message is invalid or cannot be normalized to valid V2
 * @throws {ToolArgumentParseError} if tool arguments in legacy message cannot be parsed
 */
export function normalizeMessage(msg: LegacyMessage | Message): Message {
  // If already V2, validate and return
  if (isMessageV2(msg)) return msg;

  // Convert legacy to V2
  if (msg.role === 'user') {
    const blocks = legacyToContentBlocks(msg);
    // User messages must only have text blocks
    const textBlocks = blocks.filter((b): b is TextBlock => isTextBlock(b));
    if (textBlocks.length === 0) {
      throw new Error('User message must contain at least one text block');
    }
    const user: UserMessage = {
      role: 'user',
      content: textBlocks as NonEmptyArray<TextBlock>
    };
    // Validate the result
    if (!isMessageV2(user)) {
      throw new Error('Failed to create valid V2 user message');
    }
    return user;
  }

  if (msg.role === 'assistant') {
    const blocks = legacyToContentBlocks(msg as LegacyAssistantMessage);
    // legacyToContentBlocks already ensures blocks.length > 0
    const assistant: AssistantMessage = {
      role: 'assistant',
      content: blocks as NonEmptyArray<ContentBlock>
    };
    // Validate the result
    if (!isMessageV2(assistant)) {
      throw new Error('Failed to create valid V2 assistant message');
    }
    return assistant;
  }

  // Handle tool messages
  const toolMsg = msg as LegacyToolMessage;

  // Validate tool_call_id
  if (!toolMsg.tool_call_id || toolMsg.tool_call_id.trim().length === 0) {
    throw new Error('Tool message must have a non-empty tool_call_id');
  }

  // Validate content is a string before processing
  if (typeof toolMsg.content !== 'string') {
    throw new Error('Tool message content must be a string');
  }

  const blocks: TextBlock[] = [];
  const trimmedContent = toolMsg.content?.trim();
  if (trimmedContent && trimmedContent.length > 0) {
    blocks.push({ type: 'text', text: toolMsg.content });
  }

  // Enforce non-empty content for tool messages
  if (blocks.length === 0) {
    throw new Error('Cannot normalize tool message with empty content');
  }

  const tool: ToolMessage = {
    role: 'tool',
    content: blocks as NonEmptyArray<TextBlock>,
    tool_call_id: toolMsg.tool_call_id
  };

  // Validate the result
  if (!isMessageV2(tool)) {
    throw new Error('Failed to create valid V2 tool message');
  }
  return tool;
}
