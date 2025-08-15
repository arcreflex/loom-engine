# Architecture

Big-picture map of the monorepo, boundaries, and data/control flow. Includes performance/scaling and security/secrets.

## Monorepo Layout

The system consists of two primary packages:

- **`@ankhdt/loom-engine`** (`packages/engine/`) - Pure TypeScript library for conversation tree storage and navigation
- **`@ankhdt/loom-gui`** (`packages/gui/`) - React + Tailwind SPA with Express backend

Both packages follow `type: "module"` ESM-only approach with ESBuild/Vite build pipelines.

## Runtime Topology

```
GUI Frontend (React/Vite)
    ↓ HTTP/SSE
GUI Server (Express)
    ↓ Direct calls
Engine (LoomEngine + Forest)
    ↓ Interface calls
Store (FileSystemStore)
    ↓ File I/O
Filesystem (~/.loom/)
```

### Layer Responsibilities

- **GUI Frontend**: User interface, state management (Zustand), SSE consumption
- **GUI Server**: Thin REST adapter, SSE streaming, no business logic
- **Engine**: Core conversation logic, provider orchestration, tool execution
- **Store**: Persistence abstraction, caching, consistency guarantees
- **Filesystem**: JSON files, atomic writes, directory structure

## Core Flows

### Append Flow
1. User submits input via GUI
2. Server validates and forwards to Engine
3. Engine.append() finds or creates path in Forest
4. Store writes new node to filesystem
5. Cache invalidation triggers
6. Response propagates back to GUI

### Generate Flow
1. Engine receives generation request with parameters
2. Provider selection based on model string
3. Message history construction from tree path
4. Provider API call with tool definitions
5. For tool calls: execute → append tool result → recurse
6. For multiple completions (n>1): parallel generation
7. SSE streaming of partial responses to GUI

### Edit Flow (LCP + Split)
1. Find longest common prefix between existing and new content
2. Split at divergence point, creating new branch
3. Reparent subsequent nodes to new branch
4. Update bookmarks and navigation state

### Delete Flow
1. Validate constraints (cannot delete root)
2. Choose cascade vs reparent strategy
3. Update bookmarks if affected nodes deleted
4. Rebuild affected cache entries

### Topology/Graph Read
1. NodeStructure cache provides content-free tree view
2. Lazy loading of node content on demand
3. Graph traversal respects parent/child relationships

## Server Role

The Express server is intentionally thin:

- **Request validation**: Basic parameter checking
- **SSE streaming**: Fan-out of generation events to multiple clients
- **Static serving**: Frontend assets and development proxy
- **No business logic**: All conversation logic remains in Engine

## Assumptions

- **Single-process store**: See concurrency.md for Single-Process Constraint
- **Local dev environment**: No authentication; localhost-only intended
- **Built-in tools are read-only**: introspect tool excludes .git and node_modules; no system modification
- **MCP transport limitation**: Only stdio supported; http throws "not implemented"

## Architectural Decisions

### Concurrency Model: SerialQueue
**Decision**: Use a single-threaded queue for all mutations
**Rationale**: 
- Simplicity over performance - avoids complex locking mechanisms
- Deterministic execution order - same operations produce same tree
- Easier debugging - predictable state transitions
**Trade-offs**: No parallel mutations, but acceptable for single-user tool

### Default Store: FileSystemStore
**Decision**: JSON files on local filesystem as default persistence
**Rationale**:
- Zero external dependencies - works out of the box
- Human-readable format - easy debugging and data recovery
- Simple backup - just copy directory
**Trade-offs**: Single-process only, no multi-user support

### Authentication: None
**Decision**: No authentication or authorization system
**Rationale**:
- Local development tool - not meant for production deployment
- Simplicity - no user management complexity
- Trust model - user owns their own data
**Trade-offs**: Cannot be safely exposed to network

## Determinism

**Forest mutations are serialized** ensuring same operation sequence produces same tree state.

## Security

- **No authentication**: Localhost-only intended; no auth system
- **Secrets handling**: API keys promoted from config.toml to environment variables; never written to logs
- **Tool execution**: Built-in and MCP tools run with application privileges
- **Trust boundaries**: Built-in introspect tool excludes .git and node_modules; read-only analysis only

## Trust Boundaries

**Built-in introspect tool**: Walks the loom-engine repo but explicitly excludes .git and node_modules; read-only analysis only

API contracts are minimal HTTP/JSON with SSE for real-time updates.

## Extensibility Seams

### Provider Addition
1. Implement provider interface in providers directory
2. Add to provider name registry
3. Register in engine's provider lookup
4. Add configuration section to config.toml

### Store Implementation
1. Implement Store interface
2. Handle caching and consistency requirements
3. Provide atomic write guarantees
4. Support NodeStructure cache invalidation

### Tool Integration
1. Built-in tools via ToolRegistry
2. MCP integration with stdio/http discovery
3. JSON Schema validation (pending)
4. Namespace isolation for security

## Performance and Scaling

### Store Access Patterns
- **NodeStructure caching**: Content-free topology cached aggressively
- **Invalidation triggers**: Write operations clear affected cache entries
- **Read optimization**: Lazy loading of node content, bulk operations for siblings

### Token Estimation Trade-offs
- **Input estimation**: Rough calculation for max_tokens selection
- **Provider capabilities**: KNOWN_MODELS catalog provides context length limits
- **Memory vs accuracy**: Fast estimation preferred over exact counting

### Scaling Paths
- **Alternative stores**: Database backends for multi-user scenarios
- **Background indexing**: Async content analysis and search
- **Pagination**: Large conversation tree navigation
- **Horizontal scaling**: Stateless server design enables load balancing

## Security and Secrets

### Key Handling
- **Config → env promotion**: API keys from config.toml become environment variables
- **No logging**: Secrets explicitly excluded from debug output
- **Local storage**: Keys stored in user-owned config files

### Tool/MCP Trust Boundaries
- **Namespace isolation**: MCP tools prefixed with server name
- **Execution sandboxing**: Tool results as strings only
- **Permission model**: User controls which tools are active

### Deployment Assumptions
- **Local development**: Primary use case, single user
- **Minimal network exposure**: No authentication, localhost binding
- **Data ownership**: User controls data directory location

## Non-goals

This specification does not cover:
- Code-level APIs and method signatures
- Specific HTTP request/response schemas
- Provider SDK implementation details
- UI component architecture