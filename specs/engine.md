# Engine (LoomEngine and Forest)

Define responsibilities and core behaviors of Forest and LoomEngine.

## Forest Responsibilities

The Forest class manages the conversation tree structure and provides core tree operations.

### Forest Capabilities

**Core Operations**: Create/get roots; get path/messages; append with prefix matching; split with position; edit-with-branching; delete (cascade or reparent); navigation (children/siblings).

**Guarantees**: Serialized mutations via SerialQueue; errors on missing nodes/invalid operations; prefix matching reuses existing nodes with identical content; tree structure consistency maintained.

**See code for exact method signatures.**

### Key Behaviors
- **Root management**: getOrCreateRoot finds existing or creates new based on systemPrompt matching
- **Prefix matching**: append operations reuse existing child nodes with identical messages
- **Branching**: edit operations with children create new branches; edit without children modifies in-place
- **Deletion strategies**: cascade removes descendants; reparent attaches children to grandparent
- **Path traversal**: validates reachability and throws on broken chains

## LoomEngine Responsibilities

The LoomEngine orchestrates providers, parameters, and generation flows.

### LoomEngine Capabilities

**Core Operations**: Generate with n>1 fanout and tool-calling recursion via GenerateResult.next; editNode with bookmark management; getMessages wrapper for context construction.

**Guarantees**: Conservative max_tokens clamping based on model capabilities and token estimation; coalesces adjacent same-role messages (current behavior); surfaces provider/tool errors; appends results with model/tool source_info metadata.

**See code for exact method signatures.**

### Key Behaviors
- **Generation flow**: Context construction → provider call → tool execution loop → result appending
- **Multi-completion**: Parallel generation using Promise.all for n>1 requests
- **Token estimation**: ~0.3 tokens per character heuristic with model capability clamping
- **Tool recursion**: GenerateResult.next enables streaming tool execution to UI
- **Bookmark integration**: editNode moves bookmarks when creating new nodes

### Provider Orchestration

**Provider Selection**
- Parses model string to determine provider (e.g., "openai/gpt-4o")
- Instantiates appropriate provider adapter
- Handles provider-specific configuration and authentication

**Parameter Shaping**
- Applies default parameters from configuration
- Enforces provider-specific parameter limits
- Clamps max_tokens using: min(options.max_tokens, model.capabilities.max_output_tokens, residual_input_window)
- Uses ~0.3 tokens per input character heuristic for token estimation

**Message Coalescing**
- Combines adjacent messages with the same role using separator (default empty string)
- No special handling for tool_calls - tool messages naturally break adjacency
- Current behavior coalesces purely by role adjacency

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
2. Receive assistant message with tool_calls
3. Execute each tool call through ToolRegistry
4. Append tool results to conversation
5. Recurse with tool results included in context
6. Continue until no more tool calls generated

### Model Capabilities Management

**KNOWN_MODELS Integration**
- Consults model catalog for context length limits
- Applies model-specific parameter defaults
- Handles model deprecation and fallback logic

**Effective max_tokens Selection**
- Estimates input token count for context
- Calculates remaining tokens for generation
- Applies safety margins for provider variations
- Falls back to conservative estimates for unknown models

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
2. Extract message content and tool calls
3. Validate response structure
4. Prepare for tree insertion

### Tool Call Execution Loop
Current implementation uses recursive GenerateResult.next pattern:
```
1. Assistant message with tool_calls is generated
2. Tool calls are executed and appended to conversation
3. Next generation is triggered recursively via GenerateResult.next Promise
4. Process continues until no more tool_calls are generated
```
The GenerateResult.next design enables streaming tool execution to UI.

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