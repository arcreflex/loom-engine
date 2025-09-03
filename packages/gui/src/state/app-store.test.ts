import { describe, expect, it } from 'vitest';
import { server } from '../test/testServer';
import { http, HttpResponse } from 'msw';
import { useAppStore } from './index';

describe('app store actions', () => {
  it('fetchInitialData populates GUI state and sets idle status', async () => {
    const { actions } = useAppStore.getState();
    await actions.fetchInitialData();
    const state = useAppStore.getState();
    expect(state.status.type).toBe('idle');
    expect(state.bookmarks).toEqual([]);
    expect(state.roots).toEqual([]);
    expect(state.defaultParameters).toEqual({
      n: 1,
      temperature: 1.0,
      max_tokens: 1024,
      model: 'openai/gpt-4o'
    });
  });

  it('toggles requestOnSubmit', () => {
    const { actions } = useAppStore.getState();
    const prev = useAppStore.getState().requestOnSubmit;
    actions.toggleRequestOnSubmit();
    expect(useAppStore.getState().requestOnSubmit).toBe(!prev);
  });

  it('merges default + preset + overrides for startGenerationForNode and posts', async () => {
    const calls: any[] = [];
    server.use(
      http.post('/api/nodes/:id/generate', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ success: true });
      })
    );

    // Seed state
    useAppStore.setState({
      defaultParameters: { n: 1, temperature: 0.2, max_tokens: 128 },
      presets: { fast: { temperature: 0.7, max_tokens: 256 } },
      activePresetName: 'fast',
      tools: { available: [], groups: [], ungroupedTools: [], active: ['t1'] }
    } as any);

    const { actions } = useAppStore.getState();
    actions.setCurrentModel('openai', 'gpt-4o-mini');
    await actions.startGenerationForNode('node-1' as any, { n: 3 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      n: 3,
      temperature: 0.7, // from preset
      max_tokens: 256, // from preset
      activeTools: ['t1']
    });
  });

  it('setActivePreset updates state and calls API', async () => {
    let seen: any = null;
    server.use(
      http.put('/api/config/active-preset', async ({ request }) => {
        seen = await request.json();
        return HttpResponse.json({ activePresetName: 'x' });
      })
    );
    const { actions } = useAppStore.getState();
    await actions.setActivePreset('x');
    expect(seen).toEqual({ presetName: 'x' });
    expect(useAppStore.getState().activePresetName).toBe('x');
  });
});
