import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Minimal, deterministic fixtures for GUI tests
const handlers = [
  http.get('/api/roots', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/bookmarks', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/config/presets', () => {
    return HttpResponse.json({ presets: {}, activePresetName: null });
  }),

  http.get('/api/config/defaults', () => {
    return HttpResponse.json({
      model: 'openai/gpt-4o',
      temperature: 1.0,
      maxTokens: 1024,
      n: 1,
      systemPrompt: 'You are a helpful assistant.'
    });
  }),

  http.get('/api/tools', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/graph/topology', () => {
    return HttpResponse.json([]);
  })
];

export const server = setupServer(...handlers);
