import { http, HttpResponse } from 'msw';
import { server } from './test/testServer';
import { renderWithRouter } from './test/utils/render';
import App from './App';
import { screen, waitFor } from '@testing-library/react';

describe('App boot error path', () => {
  it('shows error status when a boot request fails', async () => {
    // Make defaults endpoint fail; store should set status.error
    server.use(
      http.get('/api/config/defaults', () =>
        HttpResponse.json({ error: 'Defaults fetch failed' }, { status: 500 })
      )
    );

    renderWithRouter(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Error:/i)).toBeInTheDocument()
    );
    // Error appears in both StatusBar and sidebar; assert statusbar via title
    expect(screen.getByTitle(/Defaults fetch failed/i)).toBeInTheDocument();
  });
});
