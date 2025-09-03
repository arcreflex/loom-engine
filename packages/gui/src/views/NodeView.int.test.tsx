import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../test/utils/render';
import App from '../App';
import { server } from '../test/testServer';
import { http, HttpResponse } from 'msw';

// Minimal NodeView happy path with mocked network
describe('NodeView integration', () => {
  it('loads a node route and renders input area', async () => {
    // Handlers for node API endpoints used during navigateToNode
    server.use(
      http.put('/api/state', async () =>
        HttpResponse.json({ currentNodeId: 'ignored' })
      ),

      http.get('/api/nodes/:id', ({ params }) => {
        // Respond with a RootData-like object (no parent_id)
        return HttpResponse.json({
          id: params.id,
          child_ids: [],
          createdAt: new Date().toISOString(),
          config: { systemPrompt: 'Be helpful.' }
        });
      }),

      http.get('/api/nodes/:id/path', () => {
        return HttpResponse.json({
          root: { systemPrompt: 'Be helpful.' },
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              nodeId: 'root-1'
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hi there!' }],
              nodeId: 'child-1',
              sourceProvider: 'openai',
              sourceModelName: 'gpt-4o'
            }
          ]
        });
      }),

      http.get('/api/nodes/:id/children', () => HttpResponse.json([]))
    );

    renderWithRouter(<App />, { initialEntries: ['/nodes/root-1'] });

    // Wait until the input area appears (placeholder text)
    const input = await screen.findByPlaceholderText(/Type message/i);
    expect(input).toBeInTheDocument();

    // And the context shows our assistant reply
    await waitFor(() => {
      expect(screen.getByText(/Hi there!/i)).toBeInTheDocument();
    });
  });
});
