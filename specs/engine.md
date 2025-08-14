# Engine (LoomEngine and Forest)

Define responsibilities and core behaviors of Forest and LoomEngine.

## Forest Responsibilities

The Forest class manages the conversation tree structure and provides core tree operations.

### Core Operations

**getOrCreateRoot(rootId?: RootId)**
- Creates new conversation root or retrieves existing
- Generates unique RootId if not provided
- Initializes root node with system message
- Returns root handle for subsequent operations

**getPath(rootId: RootId, nodeId: NodeId)**
- Retrieves complete path from root to specified node
- Returns array of nodes representing conversation history
- Validates node existence and reachability
- Throws error if path is invalid or broken

**append(rootId: RootId, parentNodeId: NodeId, messages: Message[])**
- Adds new messages to conversation tree
- Implements prefix-aware appending logic
- May reuse existing nodes for identical message sequences
- Creates new branches when content diverges

### Tree Modification Operations

**split(rootId: RootId, nodeId: NodeId, splitIndex: number)**
- Splits node content at specified message index
- Creates new node for messages after split point
- Updates parent/child relationships accordingly
- Enables fine-grained conversation editing

**edit(rootId: RootId, nodeId: NodeId, newMessages: Message[])**
- Replaces node content using LCP (Longest Common Prefix) algorithm
- Finds divergence point between old and new content
- Creates branch at divergence point if necessary
- Preserves conversation history through branching

**delete(rootId: RootId, nodeId: NodeId, strategy: 'cascade' | 'reparent')**
- Removes node from conversation tree
- Cascade: deletes node and all descendants
- Reparent: attaches children to deleted node's parent
- Updates bookmarks and references

### Navigation Operations

**getChildren(rootId: RootId, nodeId: NodeId)**
- Returns array of direct child nodes
- Used for tree navigation and branch exploration
- May return empty array for leaf nodes

**getSiblings(rootId: RootId, nodeId: NodeId)**
- Returns nodes sharing same parent
- Enables horizontal navigation within conversation level
- Excludes the specified node from results

## LoomEngine Responsibilities

The LoomEngine orchestrates providers, parameters, and generation flows.

### Provider Orchestration

**Provider Selection**
- Parses model string to determine provider (e.g., "openai/gpt-4o")
- Instantiates appropriate provider adapter
- Handles provider-specific configuration and authentication

**Parameter Shaping**
- Applies default parameters from configuration
- Enforces provider-specific parameter limits
- Validates parameter combinations for compatibility

**Message Coalescing**
- Combines consecutive messages of same role when beneficial
- Handles provider-specific message format requirements
- Preserves tool call structure and ordering

### Generation Flows

#### Simple Generation (n=1, no tools)
1. Construct message history from tree path
2. Apply model-specific parameter constraints
3. Make single provider API call
4. Append response to conversation tree
5. Return generated content

#### Multi-completion Generation (n>1)
1. Prepare shared message context
2. Make parallel provider API calls with same parameters
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
```
while (response contains tool_calls) {
  for each tool_call {
    execute_tool(tool_call)
    append_tool_result_to_conversation()
  }
  generate_next_response_with_tool_results()
}
```

### Recursion Termination
- Maximum recursion depth to prevent infinite loops
- Tool execution timeout limits
- Provider API rate limiting consideration
- User cancellation handling

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