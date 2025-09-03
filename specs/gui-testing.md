# GUI Testing

Testing strategy and guidance for `packages/gui` (React + Vite + TS + Tailwind + Zustand + Express backend facade).

## Goals

- High confidence in core user flows with fast, maintainable tests.
- Lock client/server request and response contracts at the GUI boundary.
- Minimize E2E surface area; keep most value in unit/integration.

## Tooling

- Unit/Integration: Vitest (jsdom) + React Testing Library + user‑event.
- Network mocking: MSW (node/server in Vitest; service worker in browser if needed).
- E2E: Playwright (or Cypress) for one or two happy paths.

### File layout (recommended)

```
packages/gui/
  src/
    test/
      setup.ts          # vitest global setup (jest-dom, MSW server)
      testServer.ts     # MSW handlers, shared per suite
      fixtures/         # tiny JSON/topology fixtures
      utils/
        render.tsx      # custom RTL render with MemoryRouter + real store
```

### Vitest config (summary)

- `environment: 'jsdom'`
- `setupFiles: ['./src/test/setup.ts']`
- `css: true`, `globals: true`
- Coverage: reporters `text`, `lcov`; exclude `src/server.ts` and `**/*.stories.*`

## Test Pyramid

### Unit (fast, many)

- Component behavior: event handling, conditional rendering, keyboard shortcuts.
- Pure helpers: view‑layer utilities (e.g., layout, formatting).
- Store slices: exported factories or the store instance, asserting state transitions via `actions.*`.

### Contract (fast)

- API client (`src/api.ts`): assert URLs, payload shapes, and error surfacing using MSW.
- Treat these as boundary tests that detect regressions in the backend facade.

### Integration (fewer)

- Render full screens (`App`, `HomeView`, `NodeView`, and graph) with:
  - Real Zustand store (not mocked).
  - Real router (`MemoryRouter`).
  - Mocked network (MSW) for deterministic data.
- Target end‑user flows without coupling to implementation details.

Recommended flows to cover:

1. App boot: loads state, roots, bookmarks, and topology; clears loading; no console errors.
2. Command palette: opens via shortcut, filters, executes a simple command (e.g., toggle “generate on submit”).
3. Graph navigation: click node to navigate; hover shows a path preview; basic topology rendering.
4. Context & editing: expand/collapse content; edit the system prompt; save/cancel semantics.
5. Input area: type; submit (e.g., Cmd+Enter); large paste behavior; optional generate‑on‑submit toggle.
6. Node view happy path: siblings pager; copy/edit actions; child/sibling lists load and render.

### E2E (fewest)

- One thin happy path: start GUI → list roots → open a conversation → type & submit → new child appears.
- Back end options:
  - Express server pointed at a fixture temp `DATA_DIR` with deterministic sample data.
  - Minimal mock server that returns stable JSON for GUI contract.
- Keep tests hermetic; do not call external LLMs.

Playwright config tips

- Use `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.
- Start server(s) in `webServer` with a fixed `PORT`; point GUI to `API_BASE` via env.
- Seed a fixture `DATA_DIR` per run; clear between tests.

## Accessibility & Selectors

- Prefer queries by role/name/label over class names.
- Provide stable `aria-label` or `title` where needed to support RTL queries.
- Data attributes (`data-testid`) are allowed sparingly for non‑semantic controls.

Selector policy

- Prefer `getByRole(name: /.../)` or `getByLabelText`.
- Only use `data-testid` for elements without accessible roles (e.g., canvas hotspots).
- Add `title`/`aria-label` to command buttons (e.g., “Edit system prompt”, “Generate on submit”).

## Network & SSE

- Use MSW to mock HTTP endpoints used by the GUI.
- For generation/SSE flows, model discrete status events (complete nodes) rather than token streams.
- In integration tests, drive UI via mocked events and assert resulting state/UI changes.

MSW notes

- Default `onUnhandledRequest: 'error'` in tests to catch missing handlers.
- Keep handlers co-located in `src/test/testServer.ts`; augment per test with `server.use(...)`.

## State Management (Zustand)

- Export slice factories or provide a way to create isolated store instances in tests.
- Assert state transitions after invoking store actions; avoid reading private internals.

## Coverage Targets

- Aim for ≥ 80% lines/statements/branches for `packages/gui`.
- Exclude server bootstrap files from jsdom coverage if they require Node‑only globals.

## Test Hygiene

- Keep tests black‑box: assert on visible behavior, not implementation details.
- Reset store/network handlers between tests; avoid leaking global state.
- Minimize snapshots; prefer explicit assertions.

Console discipline

- Treat any `console.error`/`console.warn` in tests as failures; trap and throw in `setup.ts`.
- Avoid fake timers by default; use only when asserting debounced behavior.

## Data & Environment

- Integration/unit: all data via MSW.
- E2E: use a fixture temp `DATA_DIR`; never point tests at a production user folder.
- Tests should run without network access (aside from local dev for E2E if needed).

## Non‑goals

- Broad cross‑browser matrix; visual diffing is optional.
- Heavy mocking of internals; prefer boundary mocks (network) and real store.
- Real provider calls; those belong to engine/provider tests.

## Cross‑references

- General testing philosophy and CI gates: see `specs/testing.md`.
- GUI architecture and flows: see `specs/gui.md`.

## Quickstart (copy/paste)

See `packages/gui/src/test/testServer.ts` and `src/test/setup.ts` for minimal MSW server and global setup examples. Run:

```bash
pnpm --filter @ankhdt/loom-gui test
```
