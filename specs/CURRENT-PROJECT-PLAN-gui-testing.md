# Current Project Plan: GUI Testing Enablement

Objective: Establish a practical, fast testing setup for `packages/gui` covering core flows with unit/integration tests and a thin E2E smoke.

Owner: <name> · Reviewers: <names> · ETA: <date>

## Status (in progress)

- Tooling wired in `packages/gui`:
  - Added Vitest + RTL + MSW dev deps and scripts (`test`, `test:run`).
  - Configured `vite.config.ts` `test` block (jsdom env, setupFiles, coverage).
  - Added MSW server and fixtures: `packages/gui/src/test/testServer.ts`.
  - Added global setup with console guards and store reset: `src/test/setup.ts`.
  - Added helper `renderWithRouter`: `src/test/utils/render.tsx`.
  - Created initial screen-level test: `src/App.test.tsx`.
- Minor UI tweak to silence SSR layout warning in tests: set `defaultSize` on right Panel in `HomeView`.
- Added more coverage: API contracts, store transitions, App boot, NodeView load, InputArea submit (Ctrl/Cmd+Enter), large paste handling, and generation error surface.
- `pnpm --filter @ankhdt/loom-gui test:run` passes locally (18 tests green).

Next up: API contract tests (`src/api.ts`), store transition tests, and 2–3 more screen-level flows from the list below.
Completed in this batch; remaining candidates for v1 polish:

- Command palette execution path (toggle generate-on-submit via list selection).
- Graph hover preview minimal assertion with lightweight topology.

## Acceptance Criteria

- `pnpm --filter @ankhdt/loom-gui test` (non-watch) runs locally and in CI.
- Contract, store, and ≥ 3 screen-level integration tests are green.
- Coverage in `packages/gui` ≥ 80% lines/statements/branches (server bootstrap excluded).

## Deliverables (v1)

- Vitest + RTL + MSW wired (jsdom env, global setup).
- No Playwright/E2E in this batch. Defer thin E2E to v2.

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

## 5) Thin E2E Smoke (Deferred)

- Out of scope for batch 1. Track for v2.
- Keep guidance in `specs/gui-testing.md` but do not implement Playwright yet.

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
