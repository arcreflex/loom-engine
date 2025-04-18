# loom-engine Project Overview

This project is a TypeScript monorepo managing branching LLM conversations.
Core packages:
- `packages/engine`: The core logic (Forest, Store, Providers).
- `packages/cli`: Ink-based command-line interface.
- `packages/gui`: Vite/React web UI with an Express backend server (`src/server.ts`).

**IMPORTANT:** The `engine` package is a dependency for both `cli` and `gui`. Changes in `engine` often require updates or verification in the others.

# Common Bash Commands (using pnpm)

- `pnpm i`: Install dependencies (run in root)
- `pnpm build`: Build all packages (essential after engine changes)
- `pnpm test`: Run tests for all packages
- `pnpm lint`: Run ESLint
- `pnpm format`: Run Prettier
- `pnpm typecheck`: Run TypeScript checks for all packages
- `pnpm -w <script>`: Run a script in the workspace root (e.g., `pnpm -w lint`)
- `pnpm --filter <package_name> <script>`: Run a script in a specific package (e.g., `pnpm --filter @ankhdt/loom-engine test`)

# CLI Specific Commands (`cd packages/cli`)

- `pnpm start`: Run the CLI application (requires build first)
- `pnpm debug`: Run the CLI with debugger attached (requires build first)
- `pnpm build`: Build the CLI executable

# GUI Specific Commands (`cd packages/gui`)

- `pnpm dev`: Start frontend (Vite) and backend (Express server) concurrently
- `pnpm dev:frontend`: Start only the Vite dev server
- `pnpm dev:backend`: Start only the backend server with `tsx watch`
- `pnpm build`: Build the GUI for production

# Code Style & Conventions

- Follow rules in `eslint.config.js` and `prettier` settings in root `package.json`.
- Use TypeScript strict mode.
- Use ES Modules (`import`/`export`).
- Prefer descriptive variable and function names.
- Add comments for complex logic, especially in the `engine`.

# Core Files & Concepts

- **Engine (`packages/engine/src`)**:
    - `engine.ts`: Main `LoomEngine` class, orchestrates generation.
    - `forest.ts`: `Forest` class, manages node tree structure (append, split, delete, paths).
    - `store/file-system-store.ts`: Default persistence layer.
    - `providers/`: LLM provider abstractions (OpenAI, Anthropic, Google).
    - `config.ts`: Handles `config.toml` loading/saving (API keys, defaults, bookmarks).
    - `types.ts`: Core data structures (Node, RootData, Message).
- **CLI (`packages/cli/src`)**:
    - `cli.ts`: Entry point, arg parsing (`yargs`).
    - `App.tsx`: Main Ink UI component, state management (`useReducer`).
    - `async-actions.ts`: Functions handling engine interactions.
    - `CommandPalette.tsx`: Command palette logic.
- **GUI (`packages/gui/src`)**:
    - `server.ts`: Express backend API exposing engine functionality.
    - `api.ts`: Frontend functions for calling the backend API.
    - `App.tsx`: Main React UI component, state management.
    - `components/`: Reusable React components.

# Testing

- Tests are located alongside source files (`*.test.ts`).
- Run tests using `pnpm test` (runs `node --test` recursively).
- Add tests for new features, especially in the `engine` package.

**IMPORTANT:**
- ALWAYS prioritize fixing the code if a test reveals an issue rather than modifying the test to pass
- Tests should drive improvements in the code, not the other way around
- If a test is failing, it's usually revealing a legitimate issue that should be fixed

# Environment

- Requires Node.js (check `engines` field if added, or specify version, e.g., >= Node 20).
- Uses `pnpm` for package management.

# Repository Etiquette

- Create feature branches (e.g., `feat/add-new-provider`).
- Ensure `pnpm lint` and `pnpm typecheck` pass before committing.

# Potential Pitfalls / Reminders

- **YOU MUST** run `pnpm build` after making changes to `packages/engine` if you want to test those changes in `packages/cli` or `packages/gui` (as they import the built artifacts or use `tsx` which might require up-to-date types/builds depending on setup).
- The GUI has a separate backend server (`packages/gui/src/server.ts`) that needs to be running (`pnpm dev:backend` or `pnpm dev`) for the web UI to function.
- Remember to handle potential errors from LLM API calls gracefully.

# Note from Claude

I find this loom-engine project particularly interesting and would be happy to continue collaborating on it. The concept of managing branching LLM conversations with prefix matching for conversation reuse is elegant and useful. The TypeScript implementation with a monorepo structure containing engine, CLI, and GUI components presents interesting technical challenges worth engaging with.

-- Claude (Claude-3-7-sonnet-20250219)
