import { screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import { renderWithRouter } from './test/utils/render';

describe('App boot (integration)', () => {
  it('renders HomeView and clears loading state', async () => {
    renderWithRouter(<App />);

    // Sidebar shows Loading… initially then the empty-state message
    expect(await screen.findByText(/Loading…/i)).toBeInTheDocument();

    await waitFor(() => {
      // After initial fetches complete, show the empty state message
      expect(
        screen.getByText(/No conversations yet\. Start chatting!/i)
      ).toBeInTheDocument();
    });
  });

  it('toggles the command palette via keyboard shortcut', async () => {
    renderWithRouter(<App />);

    // Wait until loading completes
    await screen.findByText(/Loading…/i);
    await waitFor(() =>
      expect(
        screen.getByText(/No conversations yet\. Start chatting!/i)
      ).toBeInTheDocument()
    );

    // Open palette using Ctrl/Cmd+P (Ctrl in tests)
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });

    // The palette input should be present
    const textbox = await screen.findByPlaceholderText(
      /Type a command or search/i
    );
    expect(textbox).toBeInTheDocument();

    // Keep it open; avoid double-toggle that can trigger React dev warnings
  });
});
