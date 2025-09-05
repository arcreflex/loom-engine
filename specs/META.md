# META

Centralized notes on known gaps, mismatches, and pending design decisions across specs vs code.

## Known Gaps

- GUI performance claims vs implementation
  - Spec mentions lazy loading and virtualized rendering for large trees. Current GUI fetches full graph topology and renders without virtualization; hover previews are debounced but not virtualized.
  - Spec mentions broader caching and offline persistence. Current GUI maintains in‑memory state only; no persistent client cache.
  - Spec hints at robust SSE reconnection/buffering. Current implementation wires a single EventSource per pending generation without reconnection/backoff logic or buffering.
  - Action: Keep the performance items in `specs/gui.md` as future goals. Track this gap here until implemented.

If other discrepancies are found, resolve specs to match code unless explicitly noted here as an intentional future goal.
