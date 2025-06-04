# Loom Engine GUI

A web-based graphical user interface for `loom-engine` that provides core functionality for navigating conversation trees, adding messages, and generating responses.

## Features

- View conversation history in a tree structure
- Navigate between nodes (parent, siblings, etc.)
- Add user and assistant messages
- Generate AI completions
- Manage bookmarks
- Command palette for quick operations
- Keyboard shortcuts

## Running the GUI

```bash
# From the root of the monorepo
pnpm start:gui
```

## Technologies Used

- Frontend: React, TypeScript, Tailwind CSS
- Backend: Express.js serving a REST API
- Communication: Local HTTP API

## Architecture

The GUI is split into:

1. **Backend Server**: An Express.js server that wraps the loom-engine and provides a REST API
2. **Frontend**: A React application that consumes the API and provides a user interface

## Keyboard Shortcuts

- `Ctrl/Cmd+P`: Open command palette
- `Ctrl/Cmd+Enter`: Generate completion
- `Escape`: Navigate to parent (when command palette is closed)
- `Enter`: Send message (in input area)
- `Shift+Enter`: New line (in input area)

## Configuration

The GUI uses a TOML configuration file (`~/.loom/config.toml`) to store settings and preferences:

- Model settings (provider, model name, default parameters)
- API keys for providers
- Bookmarks
- Current node state

## API Endpoints

The backend server exposes various API endpoints for interacting with the loom-engine:

- `/api/state`: Get/set the current node ID
- `/api/nodes/:nodeId`: Get node details
- `/api/nodes/:nodeId/path`: Get message history
- `/api/nodes/:nodeId/children`: Get children of a node
- `/api/nodes/:nodeId/siblings`: Get siblings of a node
- `/api/nodes/:parentId/append`: Add a new message
- `/api/nodes/:nodeId/generate`: Generate completions
- `/api/bookmarks`: Manage bookmarks
- And more...

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build
```
