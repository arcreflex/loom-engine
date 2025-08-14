# Testing

Testing philosophy and requirements for the loom-engine system.

## Philosophy

**Fix the code, not the test.** Failing tests generally indicate real issues in implementation. When adding new features, add or update tests in the same package first.

## Test Structure

### Location
- Tests live next to source files as `*.test.ts`
- Use Node's experimental test runner (`node --test`)
- Each package contains its own test suite

### Categories

**Unit Tests**
- Test individual functions and classes in isolation
- Focus on edge cases and error conditions
- Mock external dependencies when appropriate

**Engine/Store Tests**
- Isolate filesystem operations using temporary directories
- Test tree consistency and invariant preservation
- Validate serialization/deserialization

**Integration Tests**
- Test full workflows end-to-end
- No mocking of providers in integration tests (or clearly document mocking strategy)
- Test tool execution and MCP integration

## Required Invariants

Tests must assert these system invariants:

### Message Coalescing
- No coalescing across tool messages (they break adjacency by role)
- Current behavior: coalesces adjacent same-role messages
- Future: should not coalesce assistant messages with tool_calls

### Tree Structure
- Root immutability: roots cannot be edited in-place
- Serialized mutations via SerialQueue
- Path traversal produces deterministic message sequences
- Node deletion maintains tree consistency

### Data Integrity
- ID uniqueness within scope (NodeId within root, RootId globally)
- Parent/child relationship consistency
- No circular references in tree structure

## CI Requirements

All commits must pass:
```bash
pnpm lint && pnpm typecheck && pnpm test
```

Pre-commit hooks enforce this locally and reject failing commits.

## Store Testing

- Use temporary directories (`os.tmpdir()`) for FileSystemStore tests
- Do not point `$DATA_DIR` to shared/production folders during test runs
- Test cache invalidation behavior explicitly
- Verify atomic write assumptions within single-file boundaries

## Provider Testing

- Mock network calls in unit tests
- Use real provider SDKs in integration tests when API keys available
- Test parameter mapping and error propagation
- Validate tool choice semantics per provider

## Non-goals

- Performance benchmarking (not in core test suite)
- UI/browser testing (GUI tests use different framework)
- Load testing or stress testing