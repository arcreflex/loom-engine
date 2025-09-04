# Current Project Plan: GUI Testing Enablement

Objective: Establish a practical, fast testing setup for `packages/gui` covering core flows with unit/integration tests and a thin E2E smoke.

Owner: <name> · Reviewers: <names> · ETA: <date>

## Status (v1 complete)

- Tooling wired in `packages/gui`:
  - Vitest + RTL + MSW dev deps and scripts (`test`, `test:run`).
  - Vitest config for jsdom, setupFiles, and coverage (`vitest.config.ts`).
  - MSW server and fixtures: `src/test/testServer.ts`.
  - Global setup: console guards, MSW, Zustand reset, DOM shims: `src/test/setup.ts`.
  - Helper `renderWithRouter`: `src/test/utils/render.tsx`.
- Minor UI tweak to silence layout warning in tests: set `defaultSize` on `HomeView` panels.
- Tests implemented (green locally):
  - Contract tests: `src/api.test.ts`.
  - Store transitions: `src/state/app-store.test.ts`.
  - Screen-level integrations:
    - App boot happy path: `src/App.test.tsx`.
    - App boot error path: `src/App.error.int.test.tsx`.
    - Node route load: `src/views/NodeView.int.test.tsx`.
    - Input submit behaviors (Ctrl/Cmd+Enter): `src/views/InputArea.int.test.tsx`.
    - Large paste navigation: `src/views/LargePaste.int.test.tsx`.
    - Generation error surfacing: `src/views/GenerationError.int.test.tsx`.
    - Command palette execution (toggle generate-on-submit): `src/views/CommandPalette.int.test.tsx`.
- Current result: `pnpm --filter @ankhdt/loom-gui test:run` passes (19 tests green).

Remaining (deferred):

- Graph hover preview minimal assertion with lightweight topology. (Likely removed/reworked with upcoming graph changes.)

## Acceptance Criteria

- `pnpm --filter @ankhdt/loom-gui test` runs locally and in CI.
- Contract, store, and ≥ 3 screen-level integration tests are green.
- Coverage in `packages/gui` ≥ 80% lines/statements/branches (exclude Node-only server bootstrap).

## Deliverables (v1)

- Vitest + RTL + MSW wired (jsdom env, global setup) and documented.
- Contract tests for `src/api.ts`.
- Store transitions tests for `useAppStore` actions.
- Screen integrations for app boot, node load, input submit, large paste, and generation error.
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
- Status: Implemented in `src/api.test.ts` (defaults/presets mapping, payload encoding, SSE wiring, error surfacing).

## 3) Store Tests

- Export store slice factories or provide an isolated store initializer for tests.
- Assert state transitions after invoking `actions.*`.
- Status: Implemented in `src/state/app-store.test.ts` (init data → idle, toggle submit, merge options, setActivePreset).

## 4) Screen‑level Integration Tests

Target high‑value flows using real store + router with MSW:

- App boot: state/roots/bookmarks/topology load; loading state clears; no console errors. [done]
- Command palette: open via keyboard, filter, execute a simple toggle. [done]
- Graph navigation: click to navigate; hover shows path preview. [deferred]
- Context & editing: expand/collapse; edit system prompt; save/cancel. [future]
- Input area: type; submit (Ctrl/Cmd+Enter); large paste behavior. [done]
- Node view: siblings pager; copy/edit actions; children/siblings load. [done basic]

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

Coverage note

- Run `pnpm --filter @ankhdt/loom-gui test:run -- --coverage` locally; CI should publish `lcov`.

## 7) Small Refactors to Ease Testing (later)

- Inject networking base (e.g., allow overriding API base path for tests).
- Export store slice factories or a store initializer.
- Extract pure helpers from complex components (e.g., layout logic) for unit testing.
- Add stable roles/labels to interactive controls for RTL queries.
- Provide small utilities to simulate SSE events as discrete status updates.

## 8) Final v1 Tasks (completed)

- Command palette execution test implemented and passing.

Deferred to a future graph rework:

- Graph hover preview test.
