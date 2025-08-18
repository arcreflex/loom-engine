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
- Future: should not coalesce messages that contain any `tool-use` blocks

### Tree Structure

- Root immutability: roots cannot be edited in-place
- Serialized mutations ensure consistency
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

## Async Operations and Promises

### Testing Strategy

- **Await all promises**: Ensure all async operations complete before assertions
- **Promise rejection handling**: Test both resolution and rejection paths
- **Timeout management**: Set appropriate timeouts for long-running operations
- **Concurrent operations**: Test race conditions with parallel async calls

### Common Patterns

- **Queue testing**: Verify operations execute in correct order
- **SSE streaming**: Mock event emitters for testing real-time updates
- **Provider responses**: Use promise-based mocks for API calls
- **Tool execution**: Test async tool calls with proper error handling

## Mocking Strategy

### When to Mock

**Mock external dependencies when**:

- Testing in isolation (unit tests)
- External service unavailable or unreliable
- Need deterministic results for edge cases
- Testing error conditions difficult to reproduce

**Use real implementations when**:

- Testing integration points
- Validating actual provider behavior
- Testing full end-to-end workflows
- Performance characteristics matter

### Mock Guidelines

- **Interface compliance**: Mocks must match actual interface exactly
- **Behavior fidelity**: Mock responses should mirror real service behavior
- **Error simulation**: Include realistic error scenarios in mocks
- **State management**: Mocks should maintain internal state when needed

### Mock vs Real Decision Criteria

1. **Speed**: Unit tests use mocks for speed; integration tests use real services
2. **Reliability**: Mock flaky external services; use real for stable ones
3. **Cost**: Mock expensive API calls in development/testing
4. **Complexity**: Mock complex setup requirements; use real for simple ones

## Integration Test Requirements

### Required Integration Tests

**Provider Integration**:

- At least one real provider test when API keys available
- Tool calling flow with actual tool execution
- Error handling from real provider responses

**Store Integration**:

- FileSystemStore with actual filesystem operations
- Cache invalidation with real file changes
- Concurrent access patterns (within single-process constraint)

**End-to-End Workflows**:

- Complete generation flow: input → provider → tools → response
- Edit flow with branching and bookmark updates
- Delete operations with cascade/reparent strategies

### Integration Test Guidelines

- **Environment setup**: Document required environment variables
- **Cleanup**: Always clean up test data after completion
- **Isolation**: Each test should be independent and idempotent
- **Timeouts**: Set generous timeouts for network operations

## Test Data Management

### Fixtures

- **Minimal examples**: Use smallest data sets that exercise functionality
- **Edge cases**: Include boundary conditions and error scenarios
- **Realistic data**: Some tests should use production-like data volumes

### Temporary Data

- **Automatic cleanup**: Use test framework's cleanup hooks
- **Unique namespaces**: Prevent collision between parallel test runs
- **Resource limits**: Monitor and limit disk/memory usage in tests

## Non-goals

- Performance benchmarking (not in core test suite)
- UI/browser testing (GUI tests use different framework)
- Load testing or stress testing
- Cross-browser compatibility testing
- Security penetration testing
