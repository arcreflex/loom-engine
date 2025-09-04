# ContentBlock Refactor Implementation Plan

CURRENT STATUS: Phase 4a–4d COMPLETED; Phase 5 (server endpoints + UI rendering) COMPLETED; Phase 6 (unit tests) COMPLETED; Phase 6 (manual validation) COMPLETED.

## Overview

This document outlines the implementation plan for migrating from the legacy message format (`content: string | null` + `tool_calls[]`) to the new ContentBlock-based format (`content: ContentBlock[]`). This is a substantial refactor that touches the core data model, persistence layer, providers, and UI components.

While working on this plan, this document should be kept up to date so that it reflects the current state of the work, and so that we can easily pick up where we left off in a new session if need be.

IMPORTANT NOTE: If, in the course of working on this plan, you may discover that there are changes we should consider making to this plan. That is encouraged! But PLEASE discuss any such ideas with the user rather than changing this plan unilaterally.

NOTE TO THE REVIEWER: substantive changes to this document (i.e., anything other than status updates or todo details) should be rejected.

## Motivation

The current message format has limitations:

- Separates content and tool calls into different fields, making it harder to preserve ordering
- Uses `null` for empty content, which is inconsistent
- Makes it difficult to add new content types (images, citations, etc.) in the future
- Requires special handling in multiple places

The new ContentBlock format:

- Unifies all message content into a single ordered array
- Supports extensibility for future content types
- Preserves the exact ordering of text and tool-use blocks
- Simplifies message handling across the codebase

## New Data Model

### Core Types

```typescript
// Content block types
type ContentBlock = TextBlock | ToolUseBlock;

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool-use';
  id: string; // Correlation ID for tool results
  name: string; // Tool name
  parameters: object; // Tool parameters (JSON)
}

// Updated message types
interface UserMessage {
  role: 'user';
  content: ContentBlock[]; // Must be non-empty
}

interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[]; // Must be non-empty, may be only tool-use blocks
}

interface ToolMessage {
  role: 'tool';
  content: ContentBlock[]; // Must be non-empty, typically single text block
  tool_call_id: string; // References a prior tool-use block's id
}
```

## Implementation Phases

### Phase 1: Core Type Updates ✅ COMPLETED

**Goal**: Update type definitions while maintaining backward compatibility

1. **Update types.ts** ✅
   - Added ContentBlock type definitions (TextBlock, ToolUseBlock)
   - Added MessageV2 interfaces using NonEmptyArray<ContentBlock> for strong typing
   - Created separate types for legacy formats (LegacyMessage, etc.)
   - Added NonEmptyArray<T> type for compile-time non-empty guarantees
   - User/Tool messages restricted to NonEmptyArray<TextBlock> at type level
   - Assistant messages allow NonEmptyArray<ContentBlock> (mixed content)
   - ToolUseBlock.parameters tightened to Record<string, unknown>

2. **Create conversion utilities** ✅
   - `legacyToContentBlocks()`: Converts old format to new with proper error handling
   - `normalizeMessage()`: Ensures message is in canonical V2 format
   - `isMessageV2()`: Type guard with role-specific validation
   - `ToolArgumentParseError`: Custom error for invalid tool arguments
   - Comprehensive test coverage including edge cases

### Phase 2: Persistence Layer ✅ COMPLETED (REVISED)

**Goal**: Support reading legacy format with explicit normalized methods

1. **FileSystemStore Updates** ✅
   - Added `loadNodeNormalized()` and `findNodesNormalized()` methods that return V2 messages
   - These methods explicitly return `NodeDataV2` with `MessageV2` type
   - Legacy `loadNode()` and `findNodes()` remain unchanged, returning legacy format
   - Proper error propagation for normalization failures (fail loudly on corrupted data)
   - No type casting or lying to the type system

2. **Type Safety** ✅
   - Added `NodeDataV2` and `NodeV2` types for nodes with V2 messages
   - Clean separation between legacy and V2 formats
   - No unsafe type casts - explicit conversion boundaries
   - Error handling separates JSON parse errors from normalization errors

3. **Migration Strategy** ✅
   - No forced migration - legacy data converted on-demand via normalized methods
   - Legacy methods continue to work unchanged for backward compatibility
   - Consumers can opt-in to V2 format by using normalized methods
   - NOTE: Write path will be updated in later phase to write V2 format (per specs/persistence.md)

4. **Comprehensive Testing** ✅
   - Tests use normalized methods explicitly - no unsafe casts
   - Tests use untyped literals for legacy data on disk
   - Added edge cases: null content with tool_calls, multiple tool_calls ordering, invalid JSON
   - Error propagation tested - normalization failures throw with actionable errors
   - All 118 tests passing

**Revised Approach**: Following review feedback, implemented explicit `loadNodeNormalized` and `findNodesNormalized` methods that return properly typed V2 data, avoiding type system lies while maintaining backward compatibility.

### Phase 3: Provider Adapters ✅ COMPLETED

**Goal**: Update providers to work with ContentBlock format

1. **Update provider base interface** ✅
   - Updated ProviderRequest to accept Message[] | MessageV2[]
   - Updated ProviderResponse to return MessageV2
   - Maintained backward compatibility during transition

2. **Update each provider (OpenAI, Anthropic, Google)** ✅
   - Created provider-utils.ts with shared conversion utilities
   - All providers now normalize input messages to V2 format
   - Convert V2 ContentBlock[] to provider-specific format on request
   - Convert provider responses back to V2 MessageV2 format
   - Preserve tool correlation IDs throughout

3. **Provider-specific implementations** ✅
   - **OpenAI**: Maps tool-use blocks to/from tool_calls array
   - **Anthropic**: Maps ContentBlocks to/from native content blocks
   - **Google**: Converts to/from function call format

4. **Backward compatibility** ✅
   - Added v2ToLegacyMessage() for converting V2 back to legacy when needed
   - Engine converts provider V2 responses to legacy for Forest compatibility
   - All existing tests pass with minimal modifications
   - Type safety maintained throughout

OUT OF SCOPE: increased validation, error handling, or other changes to how we're holding the provider APIs that aren't directly relevant to these changes. This is a tight refactor focused on generalizing the content block structure.

### Phase 4: Engine Updates (Incremental, In‑Place)

Goal: Update LoomEngine and Forest to work with the ContentBlock format using incremental, in‑place changes. Avoid parallel class hierarchies (`*V2`) to reduce boundary conversions and index drift.

Guiding principles:

- No parallel classes: update existing `Forest` and `LoomEngine` in place
- Public API stability: keep current method signatures while migrating internals
- Spec compliance gates: changes must satisfy explicit invariants (see below)
- Type safety first: no unsafe casts; introduce precise types/guards instead
- Test‑first per sub‑phase: land targeted tests before code changes

#### Phase 4a — Foundations (Utilities + Tests) ✅ COMPLETED

Create shared utilities and tests; no behavior change to public APIs yet.

1. Equality utilities
   - `stableDeepEqual(a, b)`: deep equality for ContentBlocks and `MessageV2`
     - Arrays are order‑sensitive
     - Objects are key‑order agnostic (stable key ordering)
   - Replace any `JSON.stringify` equality checks in engine code paths

2. Coalescing utilities
   - `coalesceTextOnlyAdjacent(messages)`
     - Only coalesce adjacent user/assistant messages where every block is `text`
     - Never coalesce messages that contain any `tool-use` block
     - Never coalesce tool messages
     - Preserve existing join separator behavior (no scope change)

3. Normalization for comparison
   - `normalizeForComparison(message)`
     - Drop empty text blocks (trim then filter empties)
     - Allow assistant messages with only `tool-use` blocks
     - Drop messages that become entirely empty after filtering

4. Token estimation and clamping
   - `estimateInputTokens(messages, systemPrompt)` includes the system prompt per spec
   - `clampMaxTokens(requested, caps, estimated)`
     - Subtract estimated input from model context caps
     - Enforce integer (floor) and lower‑bound ≥ 1
     - For unknown models, use conservative fallback caps

5. Tests (add before implementation)
   - Equality: parameter key order variance; nested objects; array order sensitivity
   - Coalescing: tool‑use present; adjacent text‑only; tool messages never coalesced
   - Normalization: empty text filtering; assistant tool‑use only allowed
   - Tokens: residual ≤ 0, exact boundary, rounding semantics, unknown model caps

#### Phase 4b — Forest In‑Place Updates (Public API unchanged) ✅ COMPLETED

Update internal comparison logic; do not coalesce at the Forest layer.

1. Prefix matching
   - Compute LCP over `normalizeForComparison(message)` sequences
   - Use `stableDeepEqual` for message equality checks
   - Maintain an index map from normalized to original arrays to avoid index drift

2. Node reuse
   - Reuse existing children when normalized messages are equal
   - Preserve exact stored `content` for persisted nodes

3. Tests
   - Prefix match with filtered empty messages (index alignment preserved)
   - Mixed text/tool‑use sequences
   - Adjacent text messages not coalesced at Forest layer

#### Phase 4c — LoomEngine In‑Place Updates (Public API unchanged) ✅ COMPLETED

Migrate context construction, token shaping, and tool loop to V2 internals.

1. Context construction
   - Build provider input from Forest path
   - Apply `coalesceTextOnlyAdjacent` per spec
   - Include system prompt in token estimation

2. Token shaping
   - Use `estimateInputTokens` + `clampMaxTokens`
   - Enforce invariant: effective `max_tokens` ≥ 1
   - Configuration option for residual ≤ 0: default clamp to 1; allow fail‑early mode

3. Tool loop
   - Preserve tool correlation IDs; validate `tool_call_id` references an existing prior `tool-use.id`
   - Never coalesce tool messages; do not coalesce across tool boundaries
   - Continue existing recursion semantics

4. Append filtering
   - Drop messages that become empty after normalization
   - Allow assistant messages with only `tool-use` blocks

5. Tests
   - Tool calling: single and multiple `tool-use` blocks
   - Coalescing boundaries in context building
   - Token boundary conditions and rounding

#### Phase 4d — Persistence Write Cutover ✅ COMPLETED

Switch write path to canonical V2 while keeping legacy read normalization.

1. FileSystemStore writes
   - Persist only `content: ContentBlock[]`; omit legacy fields (`tool_calls`, string `content`)

2. Reads
   - Continue using normalized read methods for legacy compatibility

3. Tests
   - Round‑trip write/read consistency in V2 form
   - Legacy on‑disk files remain readable via normalization

#### Explicit Spec Checkpoints (must validate)

- Coalescing: only adjacent text‑only user/assistant; never messages with `tool-use`; never tool messages
- Token estimation: include system prompt in estimates
- Token clamping: integer floor; enforce ≥ 1; respect provider caps and residual window
- Equality: deep equality; object key order must not affect equality; exact match for `tool-use.id` and `name`; arrays are order‑sensitive
- Message validity: non‑empty `content`; assistant may be tool‑use only; tool messages require `tool_call_id`
- Prefix semantics: LCP computed over normalized forms with stable index alignment

#### Type Safety Requirements

- Avoid `as any`/`as unknown`; if a cast seems necessary, revisit the types
- Use `NonEmptyArray<T>` for message `content` where applicable
- Provide role‑specific type guards for ContentBlocks and Messages
- Example: `const content: NonEmptyArray<TextBlock> = [{ type: 'text', text: combinedText }];`

#### High‑Risk Areas and Mitigations

- Prefix matching with normalization: use index maps; add exhaustive tests
- Coalescing with tool‑use: explicit predicates; include mixed content test cases
- Token clamping negativity: centralize clamp; add boundary tests; assert invariant in engine path

#### Test‑First Checklist (per sub‑phase)

- Coalescing: tool‑use present; adjacent text‑only; role changes; tool messages never coalesced
- Equality: parameter key order; nested objects/arrays; id/name mismatches; array order differences
- Tokens: residual ≤ 0, exact boundary, rounding; unknown model fallback caps
- Append/Prefix: empty‑text filtering; multi‑tool‑use batches; index alignment preserved

### Phase 5: UI Updates ✅ COMPLETED

**Goal**: Update GUI components to render ContentBlock format

1. **Update MessageItem component**
   - Render ContentBlock[] instead of string content + tool_calls
   - Handle mixed text and tool-use blocks
   - Preserve visual presentation

2. **Update server endpoints**
   - Ensure API returns new format
   - Handle legacy clients if needed

STATUS UPDATE (2025-09-03):

- Server endpoints: Completed for append and edit flows.
  - `POST /api/nodes/:parentId/append` now accepts `string | ContentBlock[]` (text-only), rejects tool-use blocks, and normalizes responses to V2.
  - `PUT /api/nodes/:nodeId/content` now accepts `string | ContentBlock[]` (text-only), rejects tool-use blocks, and normalizes responses to V2.
  - Existing read endpoints (`/path`, `/children`, `/siblings`, `/node`) already normalize to V2.
- UI rendering: MessageItem already renders `ContentBlock[]`; no change required.
- UI composer: Still submits plain strings for user input; optional enhancement to emit `ContentBlock[]` can be scheduled later.

Confirmed by code audit on 2025-09-03.

### Phase 6: Testing & Validation

**Goal**: Ensure correctness and compatibility

1. **Unit tests**
   - Test conversion utilities
   - Test provider conversions
   - Test message equality and coalescing
   - Test persistence layer

2. **Manual testing** (ask user to help you do this)
   - Test with existing conversation data
   - Verify UI rendering
   - Test tool execution flows
   - End-to-end generation with tools
   - Legacy data compatibility
   - Multi-provider testing

STATUS UPDATE (2025-09-04):

- Engine unit tests passing: 166 tests, 38 suites, 0 failures (node --test in packages/engine).
- GUI tests passing: 19 tests, key integration flows green.
- Persistence write path verified to V2; read normalization verified by tests.
- Manual validation completed by user against real loom data: open/view nodes, add messages, generate (incl. tool use) all working.

Cleanup follow-ups (post‑merge, non‑blocking):

- Keep legacy read helpers for one release window; plan removal next minor.
- Ensure all non‑engine coalescing helpers avoid crossing tool boundaries (engine uses the strict V2 coalescer already).
- Optional: add a configuration option to fail‑early when residual token window ≤ 0 (current default is clamp‑to‑1).

## Implementation Order

To minimize risk and maintain functionality throughout the refactor:

1. **Start with types and utilities** (Phase 1)
   - Add new types alongside old
   - Create conversion utilities
   - No breaking changes yet

2. **Update persistence layer** (Phase 2)
   - Add read-time conversion
   - Keep writing old format initially
   - Test with existing data

3. **Update providers incrementally** (Phase 3)
   - Start with one provider (suggest Anthropic as it's closest)
   - Test thoroughly before moving to next
   - Use conversion utilities for compatibility

4. **Update engine** (Phase 4a–4d)
   - 4a: Land utilities and tests (equality, coalescing, normalization, tokens)
   - 4b: Update Forest internals (prefix/equality; no coalescing in Forest)
   - 4c: Update LoomEngine internals (context/coalescing/tokens/tool loop)
   - 4d: Switch persistence write path to V2

5. **Update UI last** (Phase 5)
   - Can use conversion utilities initially
   - Gradual migration to native format

6. **Finalize and test** (Phase 6)
   - Remove legacy code paths
   - Comprehensive testing
   - Performance validation

## Migration Strategy

### Backward Compatibility

- **Read path**: Always detect and convert legacy format
- **Write path**: Initially keep writing legacy format, switch to new format once all components updated
- **API**: Support both formats initially, deprecate legacy format later
- **External tools**: Provide migration guide and utilities

### Data Migration

- **Lazy migration**: Convert data as it's accessed
- **No forced migration**: Old data remains readable
- **New data**: Always written in new format after cutover

### Rollback Plan

- Keep legacy code paths initially, but make sure they are removed after all phases are complete and user has verified that things are working.
- Do not worry: the user has made comprehensive backup before major changes

## Risk Assessment

### High Risk Areas

1. **Data corruption**: Mitigated by read-only conversion, extensive testing
2. **Provider incompatibility**: Mitigated by incremental updates, conversion utilities
3. **Performance degradation**: Mitigated by profiling, caching
4. **UI breakage**: Mitigated by gradual migration, visual testing

### Medium Risk Areas

1. **Message coalescing logic**: New rules may behave differently
2. **Tool correlation**: Must preserve IDs correctly
3. **Edge cases**: Empty content, tool-only messages

### Low Risk Areas

1. **Type definitions**: Additive changes, backward compatible
2. **Conversion utilities**: Well-defined, testable
3. **Documentation**: Can be updated incrementally

## Success Criteria

1. **All tests passing**: Existing and new tests
2. **No data loss**: All existing conversations remain accessible
3. **No functionality regression**: All features continue working
4. **Performance maintained**: No significant degradation
5. **Clean codebase**: Legacy code removed after migration
6. **User has manually validated this against his existing installation**

## Open Questions

1. **Version field**: Should we add explicit version field to persisted messages?
2. **API versioning**: How to handle API compatibility during transition?
3. **Tool-use block IDs**: Should we generate IDs or let providers handle it?
4. **Future content types**: How to make the system truly extensible?
5. **Performance**: Should we optimize ContentBlock array operations?
