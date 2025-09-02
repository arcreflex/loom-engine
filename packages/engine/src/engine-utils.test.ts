import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stableDeepEqual,
  normalizeForComparison,
  coalesceTextOnlyAdjacent,
  estimateInputTokens,
  clampMaxTokens
} from './engine-utils.ts';
import type {
  MessageV2,
  TextBlock,
  ContentBlock,
  NonEmptyArray
} from './types.ts';

function tb(text: string): TextBlock {
  return { type: 'text', text };
}

function assistant(blocks: ContentBlock[]): MessageV2 {
  return { role: 'assistant', content: blocks as NonEmptyArray<ContentBlock> };
}

function user(texts: string[]): MessageV2 {
  return {
    role: 'user',
    content: texts.map(tb) as NonEmptyArray<TextBlock>
  };
}

function tool(text: string, id = 'call-1'): MessageV2 {
  return {
    role: 'tool',
    content: [tb(text)] as NonEmptyArray<TextBlock>,
    tool_call_id: id
  };
}

describe('stableDeepEqual', () => {
  it('ignores object key order and respects array order', () => {
    const a = { x: 1, y: { b: 2, a: [1, 2] } };
    const b = { y: { a: [1, 2], b: 2 }, x: 1 };
    const c = { y: { a: [2, 1], b: 2 }, x: 1 };
    assert.equal(stableDeepEqual(a, b), true);
    assert.equal(stableDeepEqual(a, c), false);
  });

  it('compares ContentBlocks deeply', () => {
    const p1 = {
      type: 'tool-use',
      id: 'x',
      name: 'f',
      parameters: { a: 1, b: 2 }
    };
    const p2 = {
      type: 'tool-use',
      id: 'x',
      name: 'f',
      parameters: { b: 2, a: 1 }
    };
    const p3 = {
      type: 'tool-use',
      id: 'y',
      name: 'f',
      parameters: { a: 1, b: 2 }
    };
    assert.equal(stableDeepEqual(p1, p2), true);
    assert.equal(stableDeepEqual(p1, p3), false);
  });
});

describe('normalizeForComparison', () => {
  it('drops empty text blocks and can drop message when empty', () => {
    const msg = user(['  ', '\n\n']);
    const norm = normalizeForComparison(msg);
    assert.equal(norm, null);
  });

  it('keeps assistant messages with only tool-use blocks', () => {
    const m = assistant([
      { type: 'tool-use', id: '1', name: 't', parameters: {} },
      tb('   ')
    ]);
    const norm = normalizeForComparison(m)!;
    assert.equal(norm.role, 'assistant');
    assert.equal(norm.content.length, 1);
    assert.equal((norm.content[0] as any).type, 'tool-use');
  });

  it('trims text content during normalization', () => {
    const m = user(['  hello  ', '  ']);
    const norm = normalizeForComparison(m)!;
    assert.equal(norm.content.length, 1);
    assert.equal((norm.content[0] as TextBlock).text, 'hello');
  });

  it('handles tool messages', () => {
    const dropped = normalizeForComparison(tool('   '));
    assert.equal(dropped, null);
    const kept = normalizeForComparison(tool('ok'))!;
    assert.equal(kept.role, 'tool');
    assert.equal(kept.content.length, 1);
    assert.equal((kept.content[0] as TextBlock).text, 'ok');
  });
});

describe('coalesceTextOnlyAdjacent', () => {
  it('coalesces adjacent text-only user/assistant but not tool', () => {
    const msgs: MessageV2[] = [
      user(['A']),
      user(['B']),
      assistant([tb('C')]),
      assistant([tb('D')]),
      assistant([{ type: 'tool-use', id: '1', name: 'x', parameters: {} }]),
      assistant([tb('E')]),
      tool('result-1', '1'),
      tool('result-2', '2')
    ];

    const out = coalesceTextOnlyAdjacent(msgs, ' ');
    assert.equal(out.length, 6);
    assert.equal(out[0].role, 'user');
    assert.equal((out[0].content[0] as TextBlock).text, 'A B');
    assert.equal((out[1].content[0] as TextBlock).text, 'C D');
    // tool-use prevents coalescing with following assistant text
    assert.equal((out[3] as any).type, undefined);
    assert.equal(out[4].role, 'tool');
    assert.equal(out[5].role, 'tool');
  });
});

describe('estimateInputTokens', () => {
  it('includes system prompt and JSON length of messages', () => {
    const msgs: MessageV2[] = [user(['Hello']), assistant([tb('World')])];
    const expected = Math.floor(
      ('You are'.length +
        JSON.stringify(msgs[0]).length +
        JSON.stringify(msgs[1]).length) *
        0.3
    );
    const est = estimateInputTokens(msgs, 'You are');
    assert.equal(est, expected);
  });
});

describe('clampMaxTokens', () => {
  it('respects input residual and output caps', () => {
    const out = clampMaxTokens(
      40,
      { max_input_tokens: 100, max_output_tokens: 50 },
      90
    );
    assert.equal(out, 10);
  });

  it('enforces at least 1 when residual is non-positive', () => {
    const out = clampMaxTokens(
      20,
      { max_input_tokens: 100, max_output_tokens: 50 },
      150
    );
    assert.equal(out, 1);
  });

  it('uses fallback caps for unknown models', () => {
    const out = clampMaxTokens(100000, undefined, 1000);
    assert.equal(out, 7192); // min(100000, 8192, 8192-1000)
  });

  it('respects max_total_tokens when provided', () => {
    const out = clampMaxTokens(
      100,
      { max_input_tokens: 100, max_output_tokens: 100, max_total_tokens: 120 },
      50
    );
    assert.equal(out, 50);
  });
});
