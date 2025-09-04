# Engine (LoomEngine and Forest)

Define responsibilities and core behaviors of Forest and LoomEngine.

## Forest Responsibilities

The Forest class manages the conversation tree structure and provides core tree operations.

### Forest Capabilities

**Core Operations**: Create/get roots; get path/messages; append with prefix matching; split with position; edit-with-branching; delete (cascade or reparent); navigation (children/siblings).

**Guarantees**: Mutations are serialized to ensure consistency; errors on missing nodes/invalid operations; prefix matching reuses existing nodes with identical content; tree structure consistency maintained.

### Key Behaviors

- **Root management**: Finds existing or creates new roots based on system prompt matching
- **Prefix matching**: append operations reuse existing child nodes with identical messages
- **Branching**: edit operations with children create new branches; edit without children modifies in-place
- **Deletion strategies**: cascade removes descendants; reparent attaches children to grandparent
- **Path traversal**: validates reachability and throws on broken chains

## LoomEngine Responsibilities

The LoomEngine orchestrates providers, parameters, and generation flows.

### LoomEngine Capabilities

**Core Operations**: Generate with n>1 fanout and tool-calling recursion; edit nodes with bookmark management; message retrieval for context construction.

**Guarantees**: Conservative token limit clamping based on model capabilities and estimation; coalesces adjacent same-role messages when safe (text-only blocks); surfaces provider/tool errors; appends results with model/tool metadata.

### Key Behaviors

- **Generation flow**: Context construction → provider call → tool execution loop → result appending
- **Multi-completion**: Parallel generation using Promise.all for n>1 requests
- **Tool calling constraint**: When tools are active, multiple completions are not supported
- **Token estimation**: Character-based heuristic with model capability clamping
- **Tool recursion**: GenerateResult.next enables streaming tool execution to UI
- **Bookmark integration**: editNode moves bookmarks when creating new nodes
- **Append filtering**: Drop messages that contain only empty text content; allow assistant messages with `tool-use` blocks even with no text

### Provider Orchestration

**Provider Selection**

- Engine receives providerName and modelName; parsing utilities may be used at call sites
- Instantiates appropriate provider adapter
- Handles provider-specific configuration and authentication

**Parameter Shaping**

- Applies default parameters from configuration
- Enforces provider-specific parameter limits
- **Token clamping**: Applies minimum of requested tokens, model output limit, and available context window
- **Invariant**: Effective token limit is clamped to ≥ 1 (no negative values passed to providers)

**Message Coalescing**

- See errors-and-invariants.md for Message Coalescing rules
- Engine uses a V2 coalescer that only coalesces adjacent text-only user/assistant messages and never across tool-use or tool messages

### Generation Flows

#### Simple Generation (n=1, no tools)

1. Construct message history from tree path
2. Apply model-specific parameter constraints
3. Make single provider API call
4. Append response to conversation tree
5. Return generated content

#### Multi-completion Generation (n>1)

1. Prepare shared message context
2. Make parallel provider API calls using Promise.all
3. Collect multiple response variants
4. Create separate branches for each completion
5. Return array of generated nodes

#### Tool-calling Generation

1. Include tool definitions in provider request
2. Receive assistant message possibly containing `tool-use` blocks
3. Execute each tool-use block through ToolRegistry
4. Append tool results to conversation
5. Recurse with tool results included in context
6. Continue until no more tool-use blocks are generated

### Model Capabilities Management

**KNOWN_MODELS Integration**

- Consults model catalog for context length limits
- Applies model-specific parameter defaults
- Handles model deprecation and fallback logic

**Effective max_tokens Selection**

- Estimates input token count for context (including system prompt)
- Calculates remaining tokens for generation
- Applies safety margins for provider variations
- Falls back to conservative estimates for unknown models
- Enforces `max_total_tokens` when available and clamps effective `max_tokens` to ≥ 1

**Parameter Validation**

- Enforces temperature ranges per provider
- Validates max_tokens against model limits
- Applies provider-specific parameter mappings

### Built-in Tools and MCP Discovery

**Tool Registration**

- Maintains registry of available tools
- Handles built-in tools (current_date, introspect)
- Integrates MCP-discovered tools with namespacing

**Tool Execution**

- Validates tool calls against JSON schemas
- Executes tools in isolated context
- Returns results as string for assistant consumption
- Handles tool execution errors gracefully

**MCP Integration**

- Discovers MCP servers from configuration
- Maintains long-lived connections to MCP servers
- Maps MCP tools to internal tool interface
- Handles MCP server failures and recovery

## Generate Flow Details

### Context Construction

1. Retrieve conversation path from Forest
2. Convert nodes to provider message format
3. Apply message coalescing rules
4. Include system message and tool definitions

### Provider Interaction

1. Select provider based on model string
2. Shape parameters for provider requirements
3. Make API call with streaming if supported
4. Handle provider-specific error conditions

### Response Processing

1. Parse provider response format
2. Normalize into `content: ContentBlock[]` (text and `tool-use` blocks)
3. Validate response structure
4. Prepare for tree insertion

### Tool Call Execution Loop

1. Assistant message with one or more `tool-use` blocks is generated
2. Tool calls are executed and results appended to conversation
3. Next generation is triggered recursively
4. Process continues until no more `tool-use` blocks are generated

The recursive design enables streaming tool execution to UI.

### Recursion Termination

- No explicit recursion depth limits currently implemented
- No tool execution timeout limits currently
- Provider API rate limiting handled by provider SDK
- User cancellation not implemented (planned future enhancement)

## Error Handling and Recovery

### Provider Failures

- Graceful degradation when provider unavailable
- Error message propagation to user interface
- Retry logic for transient failures

### Tool Execution Failures

- Tool errors returned as tool result messages
- Conversation continues with error context
- MCP server disconnection handling

### Tree Consistency

- Validation of tree operations before execution
- Rollback capabilities for failed operations
- Cache invalidation on operation failure

## Non-goals

This specification does not cover:

- Provider-specific request/response structures (see providers spec)
- Detailed error handling implementations
- Performance optimization techniques
- Concurrent operation handling (see concurrency spec)
