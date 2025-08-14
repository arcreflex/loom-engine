# Concurrency and Ordering

Ordering and determinism in multi-threaded and multi-request scenarios.

## SerialQueue

Central mechanism for ensuring deterministic ordering of Forest mutations.

### Guarantees for Forest Mutations
**Sequential execution**: All tree-modifying operations processed in order
**Atomic operations**: Each queued operation completes before next begins
**Deterministic results**: Same sequence of operations produces same tree state

### Queue Operations
**Enqueue**: Add operation to queue with promise-based completion
**Execution**: Operations run one at a time in FIFO order
**Error handling**: Failed operations don't block subsequent operations
**Completion signaling**: Promises resolve/reject based on operation outcome

### Scope of Serialization
**Tree modifications**: append, edit, delete, split operations
**Metadata updates**: Node metadata and bookmark changes
**Cache operations**: NodeStructure cache invalidation and updates
**Exclusions**: Read operations don't require serialization

## Append/Edit/Delete Ordering

### Race Condition Prevention
**Operation ordering**: Multiple simultaneous requests serialized through queue
**Parent validation**: Ensure parent nodes exist when appending children
**Tree consistency**: Prevent corruption from concurrent tree modifications

### Operation Dependencies
**Append operations**: Must validate parent node existence
**Edit operations**: Require node existence and content validation
**Delete operations**: Check for children and update references

### Conflict Resolution
**Last-write-wins**: Later operations override conflicting earlier operations
**Validation failures**: Operations fail if preconditions not met
**Rollback handling**: Failed operations leave tree in consistent state

## GenerationRequest Manager

Manages concurrent generation requests and ensures proper resource allocation.

### Per-node Request Tracking
**Multiple requests allowed**: Multiple generations can run concurrently for the same node
**Request tracking**: Keeps a Set of requests per node for SSE fan-out
**No queuing/cancellation**: No request queuing or cancellation mechanisms implemented

### SSE Fan-out
**Multiple clients**: Single generation can stream to multiple SSE connections
**Event distribution**: Generation events broadcast to all interested clients
**Connection management**: Handle client disconnections gracefully

### Tool-call Recursion Management
**Recursive generation**: Tool calls trigger additional generation requests via GenerateResult.next
**No depth limiting**: No explicit recursion depth limits currently implemented
**No resource tracking**: No tool execution timeouts or resource monitoring currently

### Request Lifecycle
1. **Validation**: Check generation parameters and node existence
2. **Tracking**: Add to per-node request Set (no queuing)
3. **Execution**: Process through provider with SSE streaming
4. **Tool handling**: Execute tool calls and recurse via GenerateResult.next promise
5. **Completion**: Remove from tracking Set and notify clients via SSE

## Assumptions

### Single-Process Constraint
**Current design assumes single process access** to the FileSystemStore. No file locking mechanism is implemented. Relies on filesystem atomic write guarantees for individual files.

**Multi-process hazards**: Concurrent access can cause race conditions, cache inconsistency, and index corruption.

**Alternative stores**: Database backends or distributed systems can provide proper ACID transactions and multi-process coordination.

*This constraint is referenced from persistence.md and architecture.md to avoid duplication.*
**Lock services**: External coordination for multi-process scenarios

## Request Sequencing

### HTTP Request Ordering
**No global ordering**: HTTP requests processed concurrently
**Per-resource ordering**: Operations on same conversation/node serialized
**Independent operations**: Unrelated operations can proceed in parallel

### SSE Event Ordering
**Generation events**: Streamed in order of generation
**Client synchronization**: Clients may receive events at different times
**Event correlation**: Events tagged with request/generation IDs

### Tool Execution Ordering
**Sequential tools**: Tool calls within single generation executed sequentially
**Parallel generations**: Multiple generations can execute tools concurrently
**Resource contention**: Tools may compete for external resources

## Consistency Guarantees

### Within Single Process
**Read-after-write**: Reads reflect immediately preceding writes
**Transaction boundaries**: Operations complete atomically
**Cache consistency**: NodeStructure cache updated synchronously

### Across Process Boundaries
**No guarantees**: FileSystemStore doesn't provide cross-process consistency
**Detection mechanisms**: Checksum/timestamp validation for corruption detection
**Recovery strategies**: Rebuild cache and validate data integrity

### Error Recovery
**Partial failure handling**: Clean up incomplete operations
**State validation**: Verify tree consistency after failures
**Cache rebuilding**: Reconstruct NodeStructure cache from filesystem

## Performance Implications

### Queue Throughput
**Sequential bottleneck**: SerialQueue limits concurrent tree modifications
**Read optimization**: Read operations bypass queue for better performance
**Batch operations**: Group related operations for efficiency

### Memory Management
**Queue size limits**: Prevent memory exhaustion from large operation queues
**Request timeout**: Limit maximum operation execution time
**Resource cleanup**: Clean up cancelled or failed operations

### Scaling Considerations
**Vertical scaling**: Single process benefits from more CPU/memory
**Horizontal scaling**: Requires coordination mechanism for multiple processes
**Database backends**: Better suited for multi-process scenarios

## Future Enhancements

### Enhanced Concurrency
- Read-write locks for better read performance
- Optimistic concurrency control for tree operations
- Distributed coordination for multi-process scenarios

### Advanced Queue Management
- Priority-based operation ordering
- Batch operation support
- Background operation processing

### Monitoring and Observability
- Queue depth and processing time metrics
- Concurrency conflict detection and reporting
- Performance profiling for bottleneck identification

## Non-goals

This specification does not cover:
- Specific queue implementation details
- Performance benchmarks and SLA requirements
- Database-specific concurrency mechanisms
- Network-level concurrency and load balancing
- Advanced distributed systems patterns