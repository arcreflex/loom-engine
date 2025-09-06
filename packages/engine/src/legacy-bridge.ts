import type { Message, MessageV2, ContentBlock } from './types.ts';
import {
  extractTextContent,
  extractToolUseBlocks
} from './content-blocks-convert.ts';
import {
  InvalidAssistantMessageError,
  MalformedToolMessageError,
  MissingMessageContentError
} from './providers/errors.ts';

export function convertV2ToLegacy(message: MessageV2): Message {
  if (message.role === 'tool') {
    const text = extractTextContent(message.content);
    if (text == null) {
      throw new MalformedToolMessageError(
        'Tool message must have text content',
        {
          tool_call_id: message.tool_call_id
        }
      );
    }
    return { role: 'tool', content: text, tool_call_id: message.tool_call_id };
  }
  if (message.role === 'user') {
    const text = extractTextContent(message.content);
    if (text == null) throw new MissingMessageContentError('User');
    return { role: 'user', content: text };
  }
  const text = extractTextContent(message.content);
  const tools = extractToolUseBlocks(message.content);
  if (!text && (!tools || tools.length === 0))
    throw new InvalidAssistantMessageError();

  const out: Message &
    Partial<{
      tool_calls: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }> = {
    role: 'assistant',
    content: (text ?? null) as string | null
  };
  if (tools && tools.length > 0) {
    (
      out as unknown as {
        tool_calls: {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }[];
      }
    ).tool_calls = tools.map(tb => ({
      id: tb.id,
      type: 'function' as const,
      function: { name: tb.name, arguments: JSON.stringify(tb.parameters) }
    }));
  }
  return out;
}

export function extractText(blocks: ContentBlock[]): string | null {
  const texts = blocks.filter(
    (b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text'
  );
  if (texts.length === 0) return null;
  return texts.map(b => b.text || '').join('\n');
}
// TEMPORARY BRIDGE
// This module centralizes V2->legacy conversion used only at Forest/Store edges
// during the migration to V2. Once all internal paths are V2, remove this file
// and stop converting outside persistence read/write paths.
