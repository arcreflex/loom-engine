# Specs

## Intent

The architecture and intended behavior of this system should be captured in a set of "specs" that live in `specs/`.

- Audience: humans and AI agents collaborating to build and maintain the system.
- Specs should be the single source of truth for the system's design and behavior. Avoid duplicating spec content in other documents.
- Break specs up sensibly, with each domain or technical topic getting its own spec file
- Typically, specs should not redundantly capture code-level details such as data types, API contracts, invariants, that are more appropriately captured in the code itself

A good set of specs should:

- capture the architecture and intended behavior of the system
- "carve at the joints" of the system's structure and design
- avoid redundancy or fluff

The ideal state we are going for is that if we deleted every line of code, these specs would be sufficient to drive a high quality replacement implementation of the whole system.

## Layout

`AGENTS.md` should contain an index of specs. E.g.:

```
## Specification

Detailed specifications for each domain live in the `specs/` directory.

| Topic | Description | Link |

| --------------- | ------------------------------------------------ | ------------------------------------------- |
| Architecture | Overall system architecture and design decisions | [Architecture](specs/architecture.md) |
| Some component | ...description... | [Some component](specs/some-component.md) |
```

And all spec documents should live in a `specs/` dir at the root of the repo.

## Style Guidelines

- **Prefer contracts and invariants** over code signatures and request/response schemas
- **Mark implementation gaps**: If current behavior differs from intended, mark as "current vs intended" with reference to tracking issue
- **Avoid brittle details**: Parameter names, exact endpoints, and type signatures belong in code
- **Link to avoid duplication**: Reference authoritative sections rather than repeating information

## Known Gaps

Agreed gaps between current implementation and intended behavior:

- **Message coalescing**: Should not coalesce messages that contain `tool-use` blocks (see errors-and-invariants.md)
- **JSON Schema validation**: ToolRegistry should validate tool parameters before execution
- **Generation concurrency**: Should enforce single-flight generation per node (currently allows concurrent)
- **MCP HTTP transport**: Only stdio implemented; http throws "not implemented"
- **Tool execution limits**: No recursion depth limits or timeouts for tool calls
- **Effective max_tokens lower bound**: Engine should clamp to minimum 1 or fail early when context exhausted
- **MCP lifecycle management**: No restart supervision or connection cleanup for MCP servers
- **Token estimation excludes the system prompt**: engine clamps max_tokens without counting systemMessage (current); intended should include system prompt in estimation.
- **max_total_tokens cap not enforced**: engine ignores capabilities.max_total_tokens when present; intended should consider this (or explicitly decide not to).

## Decisions

Use this space to log meta-level decisions we've made.

- We do not need an extensive spec for the API server, since it's really just intended to be a thin wrapper the server is really just a node in the architecture. (Certainly we don't need to detail each endpoint and its request/response types, since those are more appropriately captured in the code itself.)
