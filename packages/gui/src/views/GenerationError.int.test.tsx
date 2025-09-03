import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/testServer';
import App from '../App';
import { renderWithRouter } from '../test/utils/render';

function seedNodeRootHandlers() {
  server.use(
    http.put('/api/state', async () =>
      HttpResponse.json({ currentNodeId: 'ignored' })
    ),
    http.get('/api/nodes/:id', ({ params }) =>
      HttpResponse.json({
        id: params.id,
        child_ids: [],
        createdAt: new Date().toISOString(),
        config: { systemPrompt: 'Be helpful.' }
      })
    ),
    http.get('/api/nodes/:id/path', ({ params }) =>
      HttpResponse.json({
        root: { systemPrompt: 'Be helpful.' },
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hi' }],
            nodeId: params.id as string
          },
          // Provide assistant message with model info so store can auto-select model
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'OK' }],
            nodeId: 'child-1',
            sourceProvider: 'openai',
            sourceModelName: 'gpt-4o-mini'
          }
        ]
      })
    ),
    http.get('/api/nodes/:id/children', () => HttpResponse.json([]))
  );
}

describe('Generation error handling', () => {
  it('shows status error when generation endpoint fails', async () => {
    seedNodeRootHandlers();

    server.use(
      http.post('/api/nodes/root-1/append', async ({ request: _request }) => {
        return HttpResponse.json({ id: 'child-err' });
      }),
      http.post('/api/nodes/child-err/generate', () =>
        HttpResponse.json({ error: 'No capacity' }, { status: 429 })
      )
    );

    renderWithRouter(<App />, { initialEntries: ['/nodes/root-1'] });

    // Wait until model shown so generation is allowed
    await waitFor(() =>
      expect(screen.getByText(/openai\/gpt-4o-mini/i)).toBeInTheDocument()
    );

    const input = await screen.findByPlaceholderText(/Type message/i);
    await userEvent.type(input, 'Hello');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

    // Should surface error in StatusBar
    await waitFor(() =>
      expect(screen.getByText(/Error:/i)).toBeInTheDocument()
    );
    expect(screen.getByTitle(/No capacity/i)).toBeInTheDocument();
  });
});
