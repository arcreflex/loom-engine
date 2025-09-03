import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from './test/testServer';
import { http, HttpResponse } from 'msw';
import {
  getDefaultConfig,
  getConfigPresets,
  generateCompletion,
  getNode,
  subscribeToGenerationUpdates
} from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client contracts', () => {
  it('maps default config fields to GenerateOptions', async () => {
    // Provided by default handlers in testServer
    const cfg = await getDefaultConfig();
    expect(cfg).toEqual({
      n: 1,
      temperature: 1.0,
      max_tokens: 1024,
      model: 'openai/gpt-4o'
    });
  });

  it('maps preset config maxTokens -> max_tokens', async () => {
    server.use(
      http.get('/api/config/presets', () =>
        HttpResponse.json({
          presets: {
            warm: { n: 2, temperature: 1.2, maxTokens: 2048 }
          },
          activePresetName: 'warm'
        })
      )
    );
    const presets = await getConfigPresets();
    expect(presets).toEqual({
      presets: { warm: { n: 2, temperature: 1.2, max_tokens: 2048 } },
      activePresetName: 'warm'
    });
  });

  it('posts correct payload for generateCompletion', async () => {
    type GenBody = {
      providerName: string;
      modelName: string;
      n: number;
      temperature: number;
      max_tokens: number;
      activeTools: string[];
    };
    type GenCall = { id: string; body: GenBody };
    const calls: GenCall[] = [];
    server.use(
      http.post('/api/nodes/:id/generate', async ({ request, params }) => {
        const body = (await request.json()) as {
          providerName: string;
          modelName: string;
          n: number;
          temperature: number;
          max_tokens: number;
          activeTools: string[];
        };
        const id = String(params.id);
        calls.push({ id, body });
        return HttpResponse.json({ success: true });
      })
    );
    await generateCompletion(
      'node-123' as any,
      'openai',
      'gpt-4o-mini',
      { n: 3, temperature: 0.5, max_tokens: 333 },
      ['web.search']
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('node-123');
    expect(calls[0].body).toMatchObject({
      providerName: 'openai',
      modelName: 'gpt-4o-mini',
      n: 3,
      temperature: 0.5,
      max_tokens: 333,
      activeTools: ['web.search']
    });
  });

  it('encodes nodeId in path parameters', async () => {
    let seenPathname = '';
    const nodeId = 'root/child with space' as any;
    server.use(
      http.get('/api/nodes/:id', ({ request }) => {
        seenPathname = new URL(request.url).pathname;
        return HttpResponse.json({
          // Minimal Root-like shape; api.getNode return type allows Node
          id: 'root-1',
          child_ids: [],
          createdAt: new Date().toISOString(),
          config: {}
        });
      })
    );
    await getNode(nodeId);
    expect(
      seenPathname.endsWith(`/api/nodes/${encodeURIComponent(nodeId)}`)
    ).toBe(true);
  });

  it('throws with server error message on non-2xx', async () => {
    server.use(
      http.get('/api/nodes/:id', () =>
        HttpResponse.json({ error: 'Boom' }, { status: 400 })
      )
    );
    await expect(getNode('x' as any)).rejects.toThrow(/Boom/);
  });

  it('subscribeToGenerationUpdates wires EventSource and callback', async () => {
    const events: unknown[] = [];
    const orig = globalThis.EventSource as typeof EventSource;
    class MockES {
      url: string;
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        this.url = url;
      }
      emit(data: any) {
        this.onmessage?.({ data: JSON.stringify(data) } as any);
      }
      close() {}
    }
    (globalThis as { [k: string]: unknown }).EventSource =
      MockES as unknown as typeof EventSource;
    try {
      const es = subscribeToGenerationUpdates('abc' as any, u =>
        (events as any).push(u)
      ) as unknown as MockES;
      expect(
        es.url.endsWith(`/api/nodes/${encodeURIComponent('abc')}/generation`)
      ).toBe(true);
      es.emit({ status: 'idle', added: [] });
      expect(events).toEqual([{ status: 'idle', added: [] }]);
    } finally {
      (globalThis as { [k: string]: unknown }).EventSource =
        orig as unknown as typeof EventSource;
    }
  });
});
