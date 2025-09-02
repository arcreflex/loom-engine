import type {
  ContentBlock,
  MessageV2,
  NonEmptyArray,
  TextBlock
} from './types.ts';
import type { ProviderModelSpec } from './providers/types.ts';

// Deep equality for JSON-like values where object key order does not matter
export function stableDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!stableDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (ta === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao).sort();
    const bKeys = Object.keys(bo).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
      const key = aKeys[i];
      if (!stableDeepEqual(ao[key], bo[key])) return false;
    }
    return true;
  }

  // number | string | boolean | symbol | bigint | function | undefined
  // For our use, we only expect JSON primitives. Fallback to strict equality already handled.
  return false;
}

// Drop empty text blocks (trimmed) for comparison; return null if empty after filtering
export function normalizeForComparison(message: MessageV2): MessageV2 | null {
  if (message.role === 'tool') {
    const content = message.content
      .map(b => (b.type === 'text' ? trimTextBlock(b) : b))
      .filter((b): b is TextBlock => b.type === 'text' && b.text.length > 0) as
      | NonEmptyArray<TextBlock>
      | TextBlock[];
    if (content.length === 0) return null;
    return { ...message, content: content as NonEmptyArray<TextBlock> };
  }

  if (message.role === 'user') {
    const content = message.content
      .map(b => (b.type === 'text' ? trimTextBlock(b) : b))
      .filter((b): b is TextBlock => b.type === 'text' && b.text.length > 0) as
      | NonEmptyArray<TextBlock>
      | TextBlock[];
    if (content.length === 0) return null;
    return { ...message, content: content as NonEmptyArray<TextBlock> };
  }

  // assistant: keep tool-use blocks as-is, drop empty text blocks
  const filtered = message.content
    .map(b => (b.type === 'text' ? trimTextBlock(b) : b))
    .filter(b => (b.type === 'text' ? b.text.length > 0 : true)) as
    | NonEmptyArray<ContentBlock>
    | ContentBlock[];
  if (filtered.length === 0) return null;
  return { ...message, content: filtered as NonEmptyArray<ContentBlock> };
}

function trimTextBlock(b: TextBlock): TextBlock {
  const t = b.text.trim();
  return t === b.text ? b : { ...b, text: t };
}

// Coalesce only adjacent text-only user/assistant messages. Never coalesce tool messages
export function coalesceTextOnlyAdjacent(
  messages: MessageV2[],
  separator = ''
): MessageV2[] {
  if (messages.length === 0) return [];

  const out: MessageV2[] = [];
  for (const msg of messages) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(msg);
      continue;
    }

    if (prev.role !== msg.role) {
      out.push(msg);
      continue;
    }

    if (msg.role === 'tool') {
      out.push(msg);
      continue;
    }

    // Only coalesce if both are text-only (no tool-use blocks)
    const prevIsTextOnly = prev.content.every(b => b.type === 'text');
    const curIsTextOnly = msg.content.every(b => b.type === 'text');

    if (prevIsTextOnly && curIsTextOnly) {
      // Concatenate text with separator
      const prevText = (prev.content as NonEmptyArray<TextBlock>)[0].text;
      const restPrev = (prev.content as NonEmptyArray<TextBlock>).slice(1);
      const newPrevText =
        prevText +
        separator +
        (msg.content as NonEmptyArray<TextBlock>)[0].text;
      const newPrevBlocks: NonEmptyArray<TextBlock> = [
        { type: 'text', text: newPrevText },
        ...restPrev,
        ...((msg.content as NonEmptyArray<TextBlock>).slice(1) as TextBlock[])
      ];
      out[out.length - 1] = { ...prev, content: newPrevBlocks } as MessageV2;
    } else {
      out.push(msg);
    }
  }
  return out;
}

export function estimateInputTokens(
  messages: MessageV2[],
  systemPrompt?: string
): number {
  const sys = systemPrompt ? systemPrompt.length : 0;
  const sum = messages.reduce((acc, m) => acc + JSON.stringify(m).length, 0);
  // Slight overestimate (~0.3 tokens per char)
  return Math.floor((sys + sum) * 0.3);
}

type ModelCaps = ProviderModelSpec['capabilities'];

export function clampMaxTokens(
  requested: number,
  caps: Partial<ModelCaps> | undefined,
  estimatedInput: number
): number {
  const fallbackMaxIn = 8192;
  const fallbackMaxOut = 8192;
  const maxOut = Math.floor(
    Math.max(1, caps?.max_output_tokens ?? fallbackMaxOut)
  );
  const maxIn = Math.floor(
    Math.max(1, caps?.max_input_tokens ?? fallbackMaxIn)
  );
  const maxTotal = caps?.max_total_tokens;

  const residualByIn = maxIn - estimatedInput; // if negative, we'll clamp to 1 later
  const residualByTotal =
    typeof maxTotal === 'number'
      ? maxTotal - estimatedInput
      : Number.POSITIVE_INFINITY;

  const allowed = Math.min(requested, maxOut, residualByIn, residualByTotal);
  return Math.max(1, Math.floor(allowed));
}
