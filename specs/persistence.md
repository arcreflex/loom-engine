# Persistence (FileSystemStore)

Filesystem store as the canonical persistence layer.

## Layout

The data directory (default `~/.loom/`) contains:

```
~/.loom/
├── config.toml              # Configuration file
├── loom.log                 # Application logs
├── roots.json               # Registry of all conversation roots
└── <rootId>/
    └── nodes/
        └── <nodeId>.json    # Individual node files
```

### File Purposes

- **roots.json**: Index of all conversation roots with basic metadata
- **nodes/\*.json**: Individual conversation nodes with messages and relationships

## Message Representation

### Canonical On-disk Format

- Node files persist messages with `content: ContentBlock[]` where each block is one of:
  - `{ type: 'text', text: string }`
  - `{ type: 'tool-use', id: string, name: string, parameters: object }` (assistant only)
- Tool result messages include `tool_call_id` referencing a prior `tool-use` block `id`.

### Legacy Compatibility (forward-migration)

- Write path: FileSystemStore persists nodes in the canonical V2 format.
- Read paths:
  - `loadNode` / `findNodes` return canonical V2 messages (`content: ContentBlock[]`).
  - `loadNodeNormalized` / `findNodesNormalized` also return V2 and validate/normalize strictly, failing loudly on malformed data.
- Legacy node files (on disk) are normalized to V2 on read. Assistant tool-use-only remains `content: [ { type: 'tool-use', ... } ]`.

### Equality and Caching

- Structural cache remains content-free; message block arrays are only loaded when reading nodes.

## ID Strategy

### Root IDs

- **Generation**: Monotonic generation with collision avoidance
- **Scope**: Globally unique across all data directories

### Node IDs

- **Generation**: Generated with collision checking against existing files
- **Scope**: Globally unique, includes root association

### ID Generation Characteristics

- **Monotonic per-process**: IDs are monotonic per process with collision checking across restarts
- **Collision avoidance**: No collision with existing files on disk
- **Human readable**: IDs contain context for debugging and root association

## Caching

### NodeStructure Cache

**Purpose**: Avoid filesystem reads for tree navigation

**Cache contents**:

- Parent/child relationships
- Node existence flags
- Root topology
- **Excludes**: Message content, metadata

**Cache structure**: In-memory structure across all roots, invalidated on save/delete

### Cache Invalidation

Cache invalidation occurs on:

- **Node saves**: New nodes added or modified
- **Node deletion**: Nodes removed from tree
- **Root updates**: Root creation or updates

### Cache Expectations

- **Performance**: Tree navigation without filesystem access
- **Consistency**: Cache reflects current filesystem state
- **Lazy population**: Cache built on-demand, not pre-loaded

## Consistency

### Write Ordering

**Direct writes**: Files written directly without temporary file sequences
**Cache invalidation**: Structure cache invalidated after writes
**No transactional guarantees**: No multi-file transaction or locking mechanisms
**Root deletion**: Root registry includes a deleted flag for filtering; deletion operation not yet implemented

### Acceptable Failure Modes

- **Stale cache**: Cache may be outdated after external modifications
- **Index inconsistency**: roots.json may briefly lag behind node creation
- **No crash recovery**: No temporary file cleanup needed

**Recovery behavior**:

- Ignore temporary files on startup
- Rebuild cache from filesystem on inconsistency detection
- Validate index against actual node files

### Atomicity Assumptions

- **Single file**: Each node write is atomic (relies on filesystem atomicity of single-file writes)
- **Multiple files**: No multi-file transaction or locking
- **Single process**: See concurrency.md for Single-Process Constraint

## Migration Considerations

### Schema Versioning

- **Current approach**: No explicit schema version in files
- **Future evolution**: Version field may be added to support migration
- **Backward compatibility**: Prefer additive changes over breaking changes

### Data Migration Strategy

- **migrate.cjs**: One-off script for legacy data format conversion
- **In-place migration**: Modify existing files rather than copying
- **Validation**: Verify migrated data integrity

### Upgrade Path

1. Backup existing data directory
2. Run migration script
3. Validate converted data
4. Remove backup after successful operation

## Replaceability

### Store Interface Expectations

Alternative store implementations must provide:

**Core operations**:

- Create/read/update/delete for roots and nodes
- Atomic write guarantees within single entities
- Parent/child relationship management

**Performance characteristics**:

- Fast tree traversal for navigation
- Efficient bulk operations for large conversations
- NodeStructure cache support

**Consistency guarantees**:

- Read-after-write consistency within single process
- Cache invalidation hooks
- Conflict detection for concurrent access

### Implementation Flexibility

Store implementations may:

- Use different ID generation strategies
- Provide stronger consistency guarantees
- Optimize for different access patterns
- Support multi-user scenarios

### Migration Between Stores

- **Export/import**: Standardized data format for store migration
- **Incremental sync**: Partial migration for large datasets
- **Validation**: Ensure data integrity across store types

## Non-goals

This specification does not cover:

- Method signatures and API contracts (see code)
- Specific error handling implementations
- Performance benchmarks or SLA requirements
- Multi-process locking mechanisms
- Backup and recovery procedures
