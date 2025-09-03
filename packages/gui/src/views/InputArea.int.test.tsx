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
          }
        ]
      })
    ),
    http.get('/api/nodes/:id/children', () => HttpResponse.json([]))
  );
}

describe('InputArea submit behaviors', () => {
  it('Ctrl+Enter submits without generate', async () => {
    seedNodeRootHandlers();

    const appendCalls: unknown[] = [];
    const generateCalls: unknown[] = [];
    server.use(
      http.post('/api/nodes/root-1/append', async ({ request }) => {
        appendCalls.push(await request.json());
        return HttpResponse.json({ id: 'child-2' });
      }),
      http.post('/api/nodes/:id/generate', async ({ request }) => {
        generateCalls.push(await request.json());
        return HttpResponse.json({ success: true });
      })
    );

    renderWithRouter(<App />, { initialEntries: ['/nodes/root-1'] });

    const input = await screen.findByPlaceholderText(/Type message/i);
    await userEvent.type(input, 'Hello world');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => expect(appendCalls).toHaveLength(1));
    expect(appendCalls[0]).toMatchObject({
      role: 'user',
      content: 'Hello world'
    });
    expect(generateCalls).toHaveLength(0);
  });

  it('Cmd+Enter submits and triggers generate (requestOnSubmit = true)', async () => {
    seedNodeRootHandlers();

    const appendCalls: unknown[] = [];
    const generateCalls: unknown[] = [];
    server.use(
      http.post('/api/nodes/root-1/append', async ({ request }) => {
        appendCalls.push(await request.json());
        return HttpResponse.json({ id: 'child-2' });
      }),
      // generation is called on the new node id
      http.post('/api/nodes/child-2/generate', async ({ request }) => {
        generateCalls.push(await request.json());
        return HttpResponse.json({ success: true });
      }),
      // provide assistant history with model info so store can set current model
      http.get('/api/nodes/root-1/path', () =>
        HttpResponse.json({
          root: { systemPrompt: 'Be helpful.' },
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hi' }],
              nodeId: 'root-1'
            },
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

      // _loadNodeData for the new node after generate
      http.get('/api/nodes/child-2', () =>
        HttpResponse.json({
          id: 'child-2',
          parent_id: 'root-1',
          root_id: 'root-1',
          child_ids: [],
          message: { role: 'user', content: 'Hello world' },
          metadata: {
            timestamp: new Date().toISOString(),
            original_root_id: 'root-1',
            source_info: { type: 'user' }
          }
        })
      ),
      http.get('/api/nodes/child-2/path', () =>
        HttpResponse.json({
          root: { systemPrompt: 'Be helpful.' },
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello world' }],
              nodeId: 'child-2'
            }
          ]
        })
      ),
      http.get('/api/nodes/child-2/siblings', () =>
        HttpResponse.json([{ id: 'child-2' }])
      ),
      http.get('/api/nodes/child-2/children', () => HttpResponse.json([]))
    );

    renderWithRouter(<App />, { initialEntries: ['/nodes/root-1'] });

    // Wait until model is selected in the status bar
    await waitFor(() =>
      expect(screen.getByText(/openai\/gpt-4o-mini/i)).toBeInTheDocument()
    );

    const input = await screen.findByPlaceholderText(/Type message/i);
    await userEvent.type(input, 'Hello world');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => expect(appendCalls).toHaveLength(1));
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]).toMatchObject({ n: 1 });
  });
});
