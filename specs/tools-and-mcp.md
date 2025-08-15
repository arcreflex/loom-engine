# Tools and MCP

Tool system and MCP integration: naming, grouping, execution, safety.

## ToolRegistry

Central registry for managing tool availability and execution.

### Registration Process

**Built-in tools**: Registered at startup with predefined schemas
**MCP tools**: Dynamically registered upon MCP server discovery
**Grouping**: Tools organized by functional groups for UI selection

### JSON Schema Constraint

**Current requirement**: All tools must provide JSON Schema for parameters
**Object schemas only**: Tools must accept object parameters (not primitives)
**Validation status**: JSON schema validation required by contract; not implemented, tracked as a gap
**Current validation**: Basic parameter validation only

### Execution Result Format

**Return type**: String only - all tool results converted to string representation
**Structured data**: Complex objects serialized to JSON strings
**Error handling**: Errors returned as descriptive error strings
**Provider consumption**: String results passed to AI providers as-is

## Built-in Tools

### current_date

Provides current date/time information to AI models
**Intent**: Avoid model knowledge cutoff issues for time-sensitive queries
**Parameters**: Optional timezone specification
**Constraints**: No system modification, read-only operation

### introspect

Introspects the loom-engine codebase (overview or all) by walking the repo, returning a formatted string of the codebase structure and content.
**Intent**: Provide the AI model that's generating the conversation with awareness of its environment.
**Parameters**: level: 'overview' | 'all' - determines depth of introspection
**Constraints**:

- read-only repository analysis
- for security and to avoid wasting tokens, excludes anything gitignored, the .git directory, and pnpm-lock.yaml

### Tool Implementation Guidelines

- **Read-only preference**: Favor information retrieval over system modification
- **Deterministic behavior**: Same inputs should produce same outputs when possible
- **Error resilience**: Handle edge cases gracefully with descriptive error messages

## Provider Integration

### Tool Definition Passing

**Schema translation**: Convert JSON schemas to provider-specific tool formats
**Name preservation**: Maintain tool names across provider boundaries
**Parameter mapping**: Ensure parameter types compatible with provider expectations

### tool_choice Semantics

**auto**: Provider chooses whether to use tools based on context
**none**: Force provider to respond without tool usage
**specific tool**: Force usage of particular tool ({ type: 'function', function: { name: string } })

**Note**: 'required' tool choice is not currently supported.

### Provider Compatibility

**OpenAI**: Native tool calling support
**Anthropic**: Tool use via content blocks
**Google**: Function calling capabilities
**Fallback**: Graceful degradation for providers without tool support

## MCP Discovery

### Naming Convention

**Format**: `{serverName}_{toolName}`
**Purpose**: Prevent naming conflicts between MCP servers
**Example**: `filesystem_readFile`, `web_search`

### Long-lived Client Connections

**Connection management**: One long-lived Stdio connection per configured server
**No restart supervision**: No restart supervision or connection lifecycle management is implemented; discovery failures are logged and ignored
**Resource cleanup**: Connections maintained until process exit

### Error Isolation

**Server failures**: Individual MCP server failures don't affect other tools
**Tool execution errors**: Isolated error handling per tool
**Graceful degradation**: System continues functioning with subset of tools

### Discovery Process

1. **Configuration scanning**: Read MCP server config from settings
2. **Connection establishment**: Connect to configured MCP servers
3. **Tool enumeration**: Discover available tools from each server
4. **Registration**: Add discovered tools to ToolRegistry with namespace prefix
5. **Error handling**: Connection failures logged, discovery continues with other servers

## MCP Communication Protocols

### stdio vs http (Future)

**Current**: stdio only - "http" transport throws "not yet implemented"
**Future**: HTTP transport for MCP servers
**Protocol abstraction**: Internal tool interface remains unchanged
**Configuration**: Server-specific transport configuration

### Message Handling

**Request serialization**: Convert tool calls to MCP protocol format
**Response parsing**: Extract results from MCP response format
**Error propagation**: Map MCP errors to internal error representation

## Tool Execution Safety

### Validation Stance

**Current**: Basic parameter validation
**Planned**: Full JSON Schema validation
**Security**: Input sanitization for tool parameters
**Authorization**: Tool-level permission checking (future enhancement)

### Execution Environment

**Isolation**: Tools executed in controlled environment
**Timeout limits**: Prevent long-running tool executions
**Resource limits**: Memory and CPU constraints for tool execution
**Error boundaries**: Exceptions contained within tool execution context

### Security Considerations

**Privilege escalation**: Tools run with application privileges
**Data access**: Tools may access filesystem and network
**User consent**: No automatic consent mechanism (assumes trusted tools)
**Audit trail**: Tool execution logging for debugging and security

## Tool Grouping and UI Integration

### Functional Groups

**Organization**: Tools grouped by functionality (filesystem, web, data analysis)
**UI presentation**: Groups enable bulk enable/disable in interface
**Configuration**: Group-level tool activation settings

### Activation Model

**Per-group activation**: Enable/disable entire tool groups
**Individual overrides**: Fine-grained control over specific tools
**Generation-time selection**: Choose active tools per generation request

### User Experience

**Discovery**: Help users understand available tool capabilities
**Control**: Granular control over which tools are available
**Feedback**: Clear indication of tool usage in conversations

## Future Enhancements

### Enhanced Validation

- Full JSON Schema validation implementation
- Runtime parameter validation
- Schema evolution and compatibility

### Security Model

- Tool permission system
- User authorization for sensitive operations
- Sandboxed execution environment

### Performance Optimization

- Tool result caching
- Parallel tool execution
- Streaming tool results

## Non-goals

This specification does not cover:

- Detailed schemas for each built-in tool
- MCP protocol implementation details
- Specific security sandboxing mechanisms
- Tool performance benchmarking
- Advanced tool orchestration patterns
