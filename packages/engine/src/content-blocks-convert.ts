import type {
  Message,
  MessageV2,
  ContentBlock,
  TextBlock,
  ToolUseBlock
} from './types.ts';
import {
  InvalidAssistantMessageError,
  MissingMessageContentError,
  MalformedToolMessageError
} from './providers/errors.ts';

// Extracts text content from ContentBlock array. Returns null if no text blocks.
// Multiple text blocks are joined with newline to preserve formatting.
export function extractTextContent(blocks: ContentBlock[]): string | null {
  const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text');
  if (textBlocks.length === 0) return null;
  return textBlocks.map(b => b.text).join('\n');
}

// Extracts tool-use blocks from ContentBlock array. Returns undefined if none.
export function extractToolUseBlocks(
  blocks: ContentBlock[]
): ToolUseBlock[] | undefined {
  const toolBlocks = blocks.filter(
    (b): b is ToolUseBlock => b.type === 'tool-use'
  );
  return toolBlocks.length > 0 ? toolBlocks : undefined;
}

// Converts a V2 message back to legacy format for backward compatibility.
// Throws specific error types to aid callers/tests.
export function v2ToLegacyMessage(message: MessageV2): Message {
  if (message.role === 'tool') {
    const textContent = extractTextContent(message.content);
    if (textContent === null) {
      throw new MalformedToolMessageError(
        'Tool message must have text content',
        { tool_call_id: message.tool_call_id }
      );
    }
    return {
      role: 'tool',
      content: textContent,
      tool_call_id: message.tool_call_id
    };
  }

  if (message.role === 'user') {
    const textContent = extractTextContent(message.content);
    if (textContent === null) {
      throw new MissingMessageContentError('User');
    }
    return {
      role: 'user',
      content: textContent
    };
  }

  // Assistant message
  const textContent = extractTextContent(message.content);
  const toolUseBlocks = extractToolUseBlocks(message.content);

  if (!textContent && (!toolUseBlocks || toolUseBlocks.length === 0)) {
    throw new InvalidAssistantMessageError();
  }

  const legacyMessage: Message = {
    role: 'assistant',
    // content may be null when tool-use only
    content: textContent as string | null
  };

  if (toolUseBlocks && toolUseBlocks.length > 0) {
    legacyMessage.tool_calls = toolUseBlocks.map(tb => ({
      id: tb.id,
      type: 'function' as const,
      function: { name: tb.name, arguments: JSON.stringify(tb.parameters) }
    }));
  }

  return legacyMessage;
}
