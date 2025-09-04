import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../test/testServer';
import { renderWithRouter } from '../test/utils/render';
import App from '../App';

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
            content: [{ type: 'text', text: 'Hello' }],
            nodeId: params.id as string
          }
        ]
      })
    ),
    http.get('/api/nodes/:id/children', () => HttpResponse.json([]))
  );
}

describe('Command Palette execution', () => {
  it('toggles Generate on Submit via command selection', async () => {
    seedNodeRootHandlers();

    renderWithRouter(<App />, { initialEntries: ['/nodes/root-1'] });

    // Wait until NodeView input is present
    await screen.findByPlaceholderText(/Type message/i);

    // Initially ON indicator should be present
    await waitFor(() =>
      expect(screen.getByTitle(/Generate on Submit: ON/i)).toBeInTheDocument()
    );

    // Open palette using Ctrl/Cmd+P (Ctrl in tests)
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    // Palette input appears
    const paletteInput = await screen.findByPlaceholderText(
      /Type a command or search/i
    );
    expect(paletteInput).toBeInTheDocument();

    // Click the toggle command
    const toggleItem = await screen.findByText(/Toggle Generate on Submit/i);
    await userEvent.click(toggleItem);

    // Palette should close
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/Type a command or search/i)
      ).not.toBeInTheDocument()
    );

    // Indicator should switch to OFF
    await waitFor(() =>
      expect(screen.getByTitle(/Generate on Submit: OFF/i)).toBeInTheDocument()
    );
  });
});
