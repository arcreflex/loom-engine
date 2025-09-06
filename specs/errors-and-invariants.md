# Error Handling and Invariants

Failure boundaries and correctness constraints that the system must maintain.

## Error-on-Missing

The system fails loudly when referencing non-existent entities to maintain data integrity.

### Node Reference Failures

**Missing nodes**: Throw error when accessing non-existent NodeId
**Broken paths**: Error on path traversal to unreachable nodes
**Orphaned references**: Detect and error on nodes with invalid parent references

### Root Reference Failures

**Invalid RootId**: Error when accessing non-existent conversation roots
**Corrupted roots.json**: Fail when root registry is corrupted or unreadable
**Missing root directories**: Error when conversation directory doesn't exist

### Parent Relationship Failures

**Invalid parent**: Error when node references non-existent parent
**Circular references**: Detect and prevent parent-child cycles
**Root parent references**: Error if root node has non-null parent

### Path Traversal Failures

**Broken chains**: Error on incomplete paths from root to target node
**Invalid node sequence**: Detect impossible parent-child sequences
**Missing intermediate nodes**: Fail when path contains gaps

## Edit Constraints (V2)

### Root Node Protection

**Cannot edit root**: Root nodes are immutable to preserve conversation context
**System message preservation**: Root system messages must remain unchanged
**Root deletion prevention**: Root nodes cannot be deleted

### Split Constraints

**Minimum content**: Cannot split nodes with insufficient content
**Split boundaries**: Splits must occur at valid message boundaries
**Tool message restriction**: Node.message.role 'tool' messages cannot be split; splitNode throws (see data-model.md editing semantics)

### Content Validation (V2)

**Message structure**: Enforce proper message role sequences
**Tool-use correlation**: Ensure tool results reference valid `tool-use` IDs via `tool_call_id`
**Content consistency**: Validate message `content` contains only well-formed blocks; non-empty arrays required

### Edit Contracts (V2)

**If node has children**: editNodeContent may split or branch depending on content changes
**If node has no children**: editNodeContent edits in-place (rejects empty edits) and updates source_info to {type: 'user'}

## Delete Constraints

### Root Protection

**Root deletion forbidden**: Cannot delete root nodes
**Tree integrity**: Deleting root would orphan entire conversation tree
**Fallback prevention**: System must always have valid root reference

### Bookmark Guardrails

**Bookmark validation**: Check for bookmarks pointing to deletion target
**Automatic updates**: Update bookmarks to valid nodes when possible
**Orphan prevention**: Remove bookmarks when no valid alternatives exist

### Reparent Semantics

**Valid reparenting**: Children can only be reparented to valid nodes
**Cycle prevention**: Reparenting cannot create circular references
**Depth limits**: Prevent excessive tree depth through reparenting

### Cascade Rules

**Child handling**: Cascading deletes remove all descendant nodes
**Reference cleanup**: Remove all references to deleted nodes
**Cache invalidation**: Clear NodeStructure cache for affected subtrees

## Provider Constraints

### Unsupported Providers

**Unknown providers**: Error on provider names not in registry
**Initialization failures**: Fail when provider cannot be instantiated
**Configuration errors**: Error on missing or invalid provider configuration

### Missing API Keys

**Authentication failures**: Error when API keys missing or invalid
**Key validation**: Validate API key format before use
**Security errors**: Never log or expose API keys in error messages

### Capability Enforcement

**Model limits**: Enforce context length and parameter limits
**Effective max_tokens invariant**: Engine clamps effective `max_tokens` to ≥ 1 based on model caps and estimated input; negative values are never passed to providers. Future option: configurable fail‑early when residual window ≤ 0.
**Feature support**: Error on unsupported features (tools, streaming)
**Rate limiting**: Handle and propagate provider rate limit errors

## Message Constraints

### Content Handling

**Non-empty blocks**: `content` must be a non-empty array
**Assistant without text**: Assistant messages may contain only `tool-use` blocks
**Empty message prevention**: Prevent messages whose blocks are all empty-text
**Block type validation**: Ensure each block is recognized (`text`, `tool-use`) and well-formed

## Message Coalescing

Authoritative rules for message coalescing behavior (referenced from data-model.md and engine.md).

**Engine behavior**: Only coalesces adjacent user/assistant messages where both are text‑only (all `content` blocks are `text`); never coalesces messages that contain any `tool-use` blocks and never coalesces tool messages.

**Deprecated helper**: The legacy role‑only `coalesceMessages` helper has been removed to prevent misuse in contexts where tool‑use semantics matter.

**Display note**: GUI visual coalescing for display purposes is separate and does not affect engine coalescing rules or stored message structure.

### Matching Rules

**Exact matching**: Message equality requires exact content match
**Tool call correlation**: Assistant and tool messages must correlate properly
**Role sequence validation**: Enforce proper conversation role sequences

## Must-fail-loudly List

The following conditions must always result in immediate failure with clear error messages:

### Data Integrity Violations

- **Circular parent references** in conversation tree
- **Missing parent nodes** for non-root nodes
- **Corrupted file structure** in data directory
- **Invalid JSON** in node or root files

### API Contract Violations

- **Invalid NodeId or RootId** format
- **Missing required parameters** in API calls
- **Type mismatches** in request/response data
- **Authentication failures** with providers

### System Constraints

- **Disk space exhaustion** when writing conversation data
- **Permission errors** accessing data directory
- **Memory exhaustion** from large conversations
- **File corruption** detected during read operations

### Configuration Errors

- **Missing configuration files** when required
- **Invalid configuration syntax** (malformed TOML)
- **Conflicting configuration values**
- **Missing required environment variables**

## Error Recovery Strategies

### Graceful Degradation

**Partial functionality**: Continue operating with reduced capabilities
**Fallback modes**: Use default values when configuration unavailable
**Provider fallbacks**: Switch to alternative providers when primary fails

### Data Recovery

**Cache rebuilding**: Reconstruct NodeStructure cache from filesystem
**Index repair**: Rebuild roots.json from conversation directories
**Consistency checking**: Validate and repair tree relationships

### User Notification

**Clear error messages**: Provide actionable error descriptions
**Recovery suggestions**: Suggest specific steps to resolve issues
**Status reporting**: Keep users informed of system state

## Validation Points

### Input Validation

**Parameter checking**: Validate all user inputs at API boundaries
**Type enforcement**: Ensure data types match expected schemas
**Range validation**: Check numeric parameters within valid ranges

### State Validation

**Tree consistency**: Verify tree structure after modifications
**Cache coherence**: Ensure cache matches filesystem state
**Reference integrity**: Validate all node and root references

### Output Validation

**Response formatting**: Ensure API responses match expected schemas
**Data completeness**: Verify all required fields present in responses
**Error formatting**: Consistent error response structure

## Error Context and Debugging

### Error Enrichment

**Context information**: Include relevant state in error messages
**Stack traces**: Preserve call stacks for debugging
**Request correlation**: Link errors to specific requests or operations

### Logging Strategy

**Error logging**: All errors logged with appropriate detail level
**Debug information**: Additional context available in debug mode
**Security considerations**: Never log sensitive information

### Monitoring Integration

**Error metrics**: Track error rates and patterns
**Alert conditions**: Define conditions requiring immediate attention
**Health checks**: Regular validation of system invariants

## Non-goals

This specification does not cover:

- Specific error message text (see implementation)
- Performance implications of validation
- Advanced debugging tools and interfaces
- Error recovery user interface design
- Third-party error monitoring integration details
