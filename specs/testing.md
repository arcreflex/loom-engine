# Testing

Testing philosophy and requirements for the loom-engine monorepo.

## Philosophy

**Fix the code, not the test.** Failing tests generally indicate real issues. When adding features, update or add tests in the same package first.

Prefer black‑box behavior over implementation details. Keep tests fast, deterministic, and isolated.

## Pyramid & Runners

- **Unit (fast, many)**: Pure functions, store slices, small components.
- **Integration (fewer)**: Screen/flow tests with real state + mocked network.
- **E2E (fewest)**: Happy paths across the full stack.

Packages use different runners suited to their environment:

- `packages/engine`: Node test runner (`node --test`). No browser APIs.
- `packages/gui`: Vitest + jsdom for unit/integration; Playwright (or similar) for thin E2E. See `specs/gui-testing.md`.

## Location & Conventions

- Tests live next to source as `*.test.ts(x)`.
- Shared GUI test utilities can live under `packages/gui/src/test/`.
- Avoid global state leakage; reset per test where applicable.

## Categories

### Engine / Store (library)

- Use temporary directories (`os.tmpdir()`) for filesystem tests.
- Assert tree invariants, ID stability, and serialization/consistency.
- Validate parameter mapping, tool invocation semantics, and error propagation.

### GUI (application)

- Unit: Component behavior and pure helpers with React Testing Library.
- Contract: API client request/response shapes via network mocking.
- Integration: Full screens with router + real store, network mocked.
- E2E: One or two happy paths, preferably against fixture data. Details in `specs/gui-testing.md`.

## Required Invariants (cross‑cutting)

### Message Coalescing (display vs. storage)

- No coalescing across tool messages.
- Adjacent same‑role messages may visually coalesce in GUI; engine invariants remain authoritative.

### Tree Structure

- Root immutability (no in‑place edits of roots).
- Deterministic path traversal; parent/child consistency; no cycles.

### Data Integrity

- ID uniqueness (RootId global; NodeId within root).
- Atomic writes and cache invalidation behaviors validated.

## Mocking Strategy

- Unit tests mock external dependencies for speed and determinism.
- Integration tests mock network boundaries, not internal logic.
- Choose realistic responses and include error paths.
- SSE: prefer discrete event simulation over token‑level streaming in tests.

## Async & Concurrency

- Await all promises; assert both resolve and reject paths.
- Control timers/timeouts; test ordering for queued/serialized operations.
- For GUI SSE flows, model events as discrete status updates.

## CI & Gates

- Commits must pass: `pnpm lint && pnpm typecheck && pnpm -r test`.
- GUI coverage targets: ≥ 80% lines/statements/branches for critical files (server bootstrap excluded from jsdom).
- E2E is thin and can be optional in CI; keep deterministic via fixtures.
- Cache pnpm store and Playwright browsers between runs.
- Fail CI on any `console.error` during tests (enforced in Vitest setup).
- Upload Playwright traces/screenshots on failure.

## Test Data Management

- Fixtures are minimal yet representative; prefer in‑test literals for clarity.
- Use unique temp dirs; never point `$DATA_DIR` to production data during tests.
- Clean up after tests and avoid cross‑test coupling.

## Non‑goals

- Load/stress and performance benchmarking (separate from core tests).
- Broad cross‑browser testing (target modern evergreen; E2E thin).
- Security penetration testing.

For GUI specifics (tooling, flows, selectors, and E2E setup), see `specs/gui-testing.md`.
