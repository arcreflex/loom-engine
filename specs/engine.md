# Engine (LoomEngine and Forest)

Define responsibilities and core behaviors of Forest and LoomEngine.

## Forest Responsibilities

The Forest class manages the conversation tree structure and provides core tree operations.

### Core Operations

**getOrCreateRoot(systemPrompt?: string): Promise<RootData>**
- Creates new conversation root or retrieves existing with matching systemPrompt
- Generates unique RootId if creating new root
- Initializes root node with system message config
- Returns root handle for subsequent operations

**getRoot(rootId: RootId): Promise<RootData | null>**
- Retrieves existing root by ID
- Returns null if root doesn't exist

**getPath({ from?: NodeId, to: NodeId }): Promise<{ root: RootData, path: NodeData[] }>**
- Retrieves complete path from root (or from node) to specified target node
- Returns root data and array of nodes representing conversation history
- Validates node existence and reachability
- Throws error if path is invalid or broken

**append(parentId: NodeId, messages: Message[], metadata: Omit<NodeMetadata, 'timestamp' | 'original_root_id'>): Promise<NodeData>**
- Adds new messages to conversation tree
- Implements prefix-aware appending logic
- May reuse existing nodes for identical message sequences
- Creates new branches when content diverges

### Tree Modification Operations

**splitNode(nodeId: NodeId, position: number): Promise<NodeData>**
- Splits node content at specified message index
- Creates new node for content after split point
- Updates parent/child relationships accordingly
- Enables fine-grained conversation editing

**editNodeContent(nodeId: NodeId, newContent: string): Promise<NodeData>**
- Replaces node message content
- Creates new node with updated content
- Preserves conversation history through branching

**deleteNode(nodeId: NodeId, reparentToGrandparent = false): Promise<Node | null>**
- Removes node from conversation tree
- reparentToGrandparent=false: cascade deletes node and all descendants
- reparentToGrandparent=true: attaches children to deleted node's parent
- Updates bookmarks and references

### Navigation Operations

**getChildren(nodeId: NodeId): Promise<NodeData[]>**
- Returns array of direct child nodes
- Used for tree navigation and branch exploration
- May return empty array for leaf nodes

**getSiblings(nodeId: NodeId): Promise<NodeData[]>**
- Returns nodes sharing same parent
- Enables horizontal navigation within conversation level
- Excludes the specified node from results

## LoomEngine Responsibilities

The LoomEngine orchestrates providers, parameters, and generation flows.

### Key Operations

**generate(rootId: RootId, providerName: ProviderName, modelName: string, contextMessages: Message[], options: GenerateOptions, activeTools?: string[]): Promise<GenerateResult>**
- Core generation method that handles the full flow
- options: { n, temperature, max_tokens }
- result: { childNodes, next?: Promise<GenerateResult> } for tool-calling recursion
- Coalesces context with coalesceMessages before provider call
- Shapes max_tokens based on KNOWN_MODELS and rough token estimate

**getMessages(nodeId: NodeId): Promise<{ root: RootConfig, messages: Message[] }>**
- Wrapper method that retrieves conversation path and converts to messages
- Used by generate to construct context

**editNode(nodeId: NodeId, newContent: string): Promise<NodeData>**
- Handles bookmark move if configStore present
- Delegates to Forest.editNodeContent

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
Current implementation uses recursive GenerateResult.next pattern:
```
1. Assistant message with tool_calls is generated
2. Tool calls are executed and appended to conversation
3. Next generation is triggered recursively via GenerateResult.next Promise
4. Process continues until no more tool_calls are generated
```
The GenerateResult.next design enables streaming tool execution to UI.

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