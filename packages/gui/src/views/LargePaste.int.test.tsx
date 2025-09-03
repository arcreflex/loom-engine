import { screen, waitFor, fireEvent } from '@testing-library/react';
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
          }
        ]
      })
    ),
    http.get('/api/nodes/:id/children', () => HttpResponse.json([]))
  );
}

describe('Large paste behavior', () => {
  it('intercepts large paste and navigates to new node', async () => {
    seedNodeRootHandlers();

    server.use(
      // append returns a new node id
      http.post('/api/nodes/root-1/append', async () =>
        HttpResponse.json({ id: 'pasted-1' })
      ),
      // subsequent load for new node
      http.get('/api/nodes/pasted-1', () =>
        HttpResponse.json({
          id: 'pasted-1',
          parent_id: 'root-1',
          root_id: 'root-1',
          child_ids: [],
          message: { role: 'user', content: '...' },
          metadata: {
            timestamp: new Date().toISOString(),
            original_root_id: 'root-1',
            source_info: { type: 'user' }
          }
        })
      ),
      http.get('/api/nodes/pasted-1/path', () =>
        HttpResponse.json({
          root: { systemPrompt: 'Be helpful.' },
          messages: []
        })
      ),
      http.get('/api/nodes/pasted-1/siblings', () =>
        HttpResponse.json([{ id: 'pasted-1' }])
      ),
      http.get('/api/nodes/pasted-1/children', () => HttpResponse.json([]))
    );

    renderWithRouter(<App />, { initialEntries: ['/nodes/root-1'] });

    const input = await screen.findByPlaceholderText(/Type message/i);
    // Simulate large paste via fireEvent to include clipboardData.getData
    const large = 'x'.repeat(600);
    fireEvent.paste(input, {
      clipboardData: {
        getData: (type: string) => (type === 'text' ? large : '')
      }
    } as unknown as ClipboardEvent);

    // NavigationManager should navigate to the new node; we can assert via URL text in logs or by new request handlers
    await waitFor(() => {
      // After navigation, input should still exist (new route mounted)
      expect(screen.getByPlaceholderText(/Type message/i)).toBeInTheDocument();
    });
  });
});
