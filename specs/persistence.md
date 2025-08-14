# Persistence (FileSystemStore)

Filesystem store as the canonical persistence layer.

## Layout

The data directory (default `~/.loom/`) contains:

```
~/.loom/
├── config.toml              # Configuration file
├── loom.log                 # Application logs
├── roots.json               # Registry of all conversation roots
└── conversations/
    ├── <rootId>/
    │   ├── nodes/
    │   │   ├── <nodeId>.json # Individual node files
    │   │   └── ...
    │   └── metadata.json     # Root-level metadata
    └── ...
```

### File Purposes

- **roots.json**: Index of all conversation roots with basic metadata
- **metadata.json**: Per-root metadata (creation time, tags, etc.)
- **nodes/*.json**: Individual conversation nodes with messages and relationships

## ID Strategy

### Root IDs
- **Generation**: Timestamp-based with random suffix for uniqueness
- **Format**: `root_${timestamp}_${randomSuffix}`
- **Scope**: Globally unique across all data directories

### Node IDs
- **Generation**: Root-coupled with sequential or random component
- **Format**: `${rootId}_node_${sequence}` or similar deterministic scheme
- **Scope**: Unique within root, may conflict across roots (acceptable)

### Deterministic Considerations
- **Reproducible**: Same conversation sequence should produce same IDs when possible
- **Collision avoidance**: Random components prevent accidental conflicts
- **Human readable**: IDs contain enough context for debugging

## Caching

### NodeStructure Cache
**Purpose**: Avoid filesystem reads for tree navigation

**Cache contents**:
- Parent/child relationships
- Node existence flags
- Root topology
- **Excludes**: Message content, metadata

**Cache key**: RootId → NodeStructure mapping

### Invalidation Triggers
Cache invalidation occurs on:
- **Node creation**: New nodes added to tree
- **Node deletion**: Nodes removed from tree
- **Tree modifications**: Parent/child relationship changes
- **Root operations**: Root creation or deletion

### Cache Expectations
- **Performance**: Tree navigation without filesystem access
- **Consistency**: Cache reflects current filesystem state
- **Lazy population**: Cache built on-demand, not pre-loaded

## Consistency

### Write Ordering
**Atomic writes**: Individual file operations are atomic at filesystem level

**Operation sequence**:
1. Write node content to temporary file
2. Update parent/child relationships in separate files
3. Atomic rename/move to final location
4. Update index files (roots.json) last

### Acceptable Failure Modes
- **Partial writes**: Temporary files may exist after crash
- **Stale cache**: Cache may be outdated after external modifications
- **Index inconsistency**: roots.json may briefly lag behind node creation

**Recovery behavior**:
- Ignore temporary files on startup
- Rebuild cache from filesystem on inconsistency detection
- Validate index against actual node files

### Atomicity Assumptions
- **Single file**: Each node write is atomic
- **Multiple files**: Cross-file consistency not guaranteed
- **Process boundaries**: Multiple processes may cause conflicts

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