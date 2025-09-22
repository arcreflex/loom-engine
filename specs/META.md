# META

Centralized notes on known gaps, mismatches, and pending design decisions across specs vs code.

## Known Gaps

- **SSE resiliency**: reconnection/backoff/buffering still future work.
- **Client caching**: Outline is topology-first and lazy-loads content; no persistent client cache yet.
- (Removed) Global/multi-root Graph performance — spec now scopes UI to Outline plus optional Compact Graph, so this gap no longer applies.

If other discrepancies are found, resolve specs to match code unless explicitly noted here as an intentional future goal.
