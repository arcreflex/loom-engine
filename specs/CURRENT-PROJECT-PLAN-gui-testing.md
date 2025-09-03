# Current Project Plan: GUI Testing Enablement

Objective: Establish a practical, fast testing setup for `packages/gui` covering core flows with unit/integration tests and a thin E2E smoke.

Owner: <name> · Reviewers: <names> · ETA: <date>

## Acceptance Criteria

- `pnpm --filter @ankhdt/loom-gui test` runs locally and in CI.
- Contract, store, and ≥ 3 screen-level integration tests are green.
- E2E smoke runs headless in CI (optional) with traces/screenshots on failure.
- Coverage in `packages/gui` ≥ 80% lines/statements/branches (server bootstrap excluded).

## Deliverables (v1)

- Vitest + RTL + MSW wired (jsdom env, global setup).
- Playwright project with one happy path, hermetic data.

## 0) Tooling and Wiring

- Add test runner and libraries for React (Vitest + RTL + user‑event).
- Add network mocking (MSW) and a global test setup file.
- Ensure jsdom environment and CSS handling for component tests.
- Add a `test` script under `packages/gui` and include GUI tests in root `pnpm -r test`.

Implementation notes

- Add `src/test/setup.ts` as Vitest `setupFiles`.
- Trap console noise in tests:
  ```ts
  const prev = console.error;
  beforeAll(() => {
    console.error = (...args) => {
      prev(...args);
      throw new Error('console.error in test');
    };
  });
  afterAll(() => {
    console.error = prev;
  });
  ```
- Use `vi.useFakeTimers()` only for debounce/throttle assertions; prefer real timers otherwise to avoid flakes.

## 1) Test‑enabling Refactors (do now)

- Export a `createTestStore()` (or slice factories) for isolated Zustand stores per test.
- Inject API base (e.g., read `window.__API_BASE__`/env) so tests/E2E can point the client cleanly.
- Add stable roles/labels/titles for controls targeted via RTL.
- Guard console noise in Vitest setup (treat `console.error` as failure).

## 2) Contract Tests (API Client)

- Lock request/response shapes of the thin client (`src/api.ts`) using MSW.
- Cover success and error paths; assert URLs, method, payload, and error messaging.

## 3) Store Tests

- Export store slice factories or provide an isolated store initializer for tests.
- Assert state transitions after invoking `actions.*`.

## 4) Screen‑level Integration Tests

Target high‑value flows using real store + router with MSW:

- App boot: state/roots/bookmarks/topology load; loading state clears; no console errors.
- Command palette: open via keyboard, filter, execute a simple toggle.
- Graph navigation: click to navigate; hover shows path preview.
- Context & editing: expand/collapse; edit system prompt; save/cancel.
- Input area: type; submit (e.g., Cmd+Enter); large paste behavior.
- Node view: siblings pager; copy/edit actions; children/siblings load.

## 5) Thin E2E Smoke (Optional)

- One happy path across the full stack.
- Server pointed at a fixture temp `DATA_DIR` or replaced with a tiny mock server.
- Mock external LLM calls at the server boundary; keep tests deterministic.
- Run in CI with:
  ```bash
  pnpm exec playwright install --with-deps
  pnpm --filter @ankhdt/loom-gui test:e2e
  ```

## 6) CI & Quality Bars

- Gate on `pnpm lint && pnpm typecheck && pnpm -r test`.
- Coverage target for GUI: ≥ 80% lines/statements/branches for core files.
- Keep E2E optional or isolated due to runtime cost.

CI tips

- Cache pnpm store and Playwright browsers (`~/.cache/ms-playwright`).
- Upload Playwright traces/screenshots on failure (`trace: 'on-first-retry'`).
- Fail job on any `console.error` during Vitest runs (see trap above).
- Treat `packages/gui/src/server.ts` as Node-only; exclude from jsdom coverage.

## 7) Small Refactors to Ease Testing (later)

- Inject networking base (e.g., allow overriding API base path for tests).
- Export store slice factories or a store initializer.
- Extract pure helpers from complex components (e.g., layout logic) for unit testing.
- Add stable roles/labels to interactive controls for RTL queries.
- Provide small utilities to simulate SSE events as discrete status updates.
