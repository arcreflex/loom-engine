# ContentBlock Refactor Implementation Plan

CURRENT STATUS: Not started.

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

### Phase 1: Core Type Updates

**Goal**: Update type definitions while maintaining backward compatibility

1. **Update types.ts**
   - Add ContentBlock type definitions
   - Update Message interfaces to use ContentBlock[]
   - Use separate types to represent legacy formats (prefer keeping the new types clean / unpolluted by legacy cruft)
   - Add useful helpers, e.g. probably want one for narrowing a given `LegacyMessage | Message` (or whatever they're called) to the correct type

2. **Create conversion utilities**
   - `legacyToContentBlocks()`: Convert old format to new
   - `normalizeMessage()`: Ensure message is in canonical format

### Phase 2: Persistence Layer

**Goal**: Support reading legacy format and writing new format

1. **Update FileSystemStore**
   - Modify read path to detect and convert legacy messages
   - Update write path to always persist new format
   - Add version detection logic
   - Ensure cache invalidation works correctly

2. **Migration considerations**
   - No forced migration - convert on read
   - New writes always use new format
   - Preserve backward compatibility for external tools

Note: use the type system to properly represent reality, taking care at the boundaries - e.g., the type for what we read off disk should represent the fact that it may be either legacy or new. At the same time, try to contain the proliferation of `Legacy... | ` by judicious choice of where in the data flow we convert.

### Phase 3: Provider Adapters

**Goal**: Update providers to work with ContentBlock format

1. **Update provider base interface**
   - Accept ContentBlock[] in generate method
   - Return ContentBlock[] from responses

2. **Update each provider (OpenAI, Anthropic, Google)**
   - Convert ContentBlock[] to provider-specific format on request
   - Convert provider responses to ContentBlock[] format
   - Preserve tool correlation IDs
   - Handle edge cases (empty content, tool-only messages)

3. **Provider-specific considerations**
   - **OpenAI**: Map tool-use blocks to tool_calls array
   - **Anthropic**: Already uses similar content block structure
   - **Google**: Convert to function call format

OUT OF SCOPE: increased validation, error handling, or other changes to how we're holding the provider APIs that aren't directly relevant to these changes. This is a tight refactor focused on generalizing the content block structure.

### Phase 4: Engine Updates

**Goal**: Update LoomEngine and Forest to work with new format

1. **Update Forest**
   - Message equality checks using ContentBlock comparison
   - Prefix matching with new format
   - Node reuse logic

2. **Update LoomEngine**
   - Message coalescing rules (only coalesce text-only messages)
   - Tool execution flow with tool-use blocks
   - Generation flow updates
   - Empty content handling

### Phase 5: UI Updates

**Goal**: Update GUI components to render ContentBlock format

1. **Update MessageItem component**
   - Render ContentBlock[] instead of string content + tool_calls
   - Handle mixed text and tool-use blocks
   - Preserve visual presentation

2. **Update server endpoints**
   - Ensure API returns new format
   - Handle legacy clients if needed

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

4. **Update engine** (Phase 4)
   - Modify internal handling
   - Use conversion at boundaries
   - Maintain API compatibility

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
