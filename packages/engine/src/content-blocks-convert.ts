import type { ContentBlock, TextBlock, ToolUseBlock } from './types.ts';

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
