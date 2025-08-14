# Configuration

Config resolution and intended behavior.

## Data Directory Resolution

### Default Location
**Primary**: `~/.loom/` (with tilde expansion)
**Override**: `DATA_DIR` environment variable with absolute path
**Validation**: Directory created if it doesn't exist
**Single data root**: All conversation data under one directory tree

### Directory Structure
```
~/.loom/
├── config.toml           # Main configuration file
├── config.development.toml # Environment-specific overrides
├── config.production.toml  # Production settings
├── loom.log              # Application logs
└── conversations/        # Conversation data
```

## Default Config File Provisioning

### Automatic Creation
When `config.toml` doesn't exist:
1. **Create stub config** with essential sections
2. **Populate defaults** for all providers
3. **Add placeholder API keys** with descriptive comments
4. **Include example presets** for common use cases

### Stub Config Content
```toml
[providers.openai]
# apiKey = "sk-..."  # Uncomment and add your API key
baseURL = "https://api.openai.com/v1"

[providers.anthropic]
# apiKey = "sk-ant-..."  # Uncomment and add your API key

[defaults]
model = "openai/gpt-4o"
temperature = 1.0
maxTokens = 1024
n = 1
systemPrompt = "You are a helpful assistant."
```

## Configuration Layering

### File Precedence (Highest to Lowest)
1. **Environment-specific config**: `config.{NODE_ENV}.toml`
2. **Main config file**: `config.toml`
3. **Built-in defaults**: Hardcoded fallback values

### Merge Strategy
**Deep merge**: Nested objects combined, not replaced
**Array replacement**: Arrays completely replaced, not merged
**Type preservation**: Maintain data types across layers

### Example Layering
Base `config.toml`:
```toml
[defaults]
model = "openai/gpt-4o"
temperature = 1.0
```

Environment `config.development.toml`:
```toml
[defaults]
temperature = 0.7  # Override for development
```

Result: Development uses gpt-4o model with 0.7 temperature.

## Environment Variable Promotion

### API Key Promotion
**Target variables**:
- `OPENAI_API_KEY` ← `providers.openai.apiKey`
- `ANTHROPIC_API_KEY` ← `providers.anthropic.apiKey`
- `GOOGLE_API_KEY` ← `providers.google.apiKey`
- `OPENROUTER_API_KEY` ← `providers.openrouter.apiKey`

### Promotion Logic
1. **Check existing env var**: Skip if already set
2. **Read from config**: Extract apiKey from provider section
3. **Set environment variable**: Make available to provider SDKs
4. **Validation**: Warn if API key format looks invalid

### Security Considerations
- **No logging**: API keys never logged or exposed in debug output
- **Process-local**: Environment variables only set for current process
- **Temporary**: Variables not persisted beyond application runtime

## Defaults and Presets

### Composition Model
**Base defaults**: System-wide default parameters
**Preset overrides**: Named parameter sets that override defaults
**User parameters**: Request-specific parameters (highest priority)

### Preset Structure
```toml
[presets.creative]
temperature = 1.5
maxTokens = 2048
systemPrompt = "You are a creative writing assistant."

[presets.analytical]
temperature = 0.3
model = "anthropic/claude-3-sonnet"
```

### activePresetName Switching
**Selection mechanism**: `activePresetName` field selects current preset
**Dynamic switching**: Change active preset without editing defaults
**Fallback behavior**: Use base defaults if preset name invalid

### Parameter Resolution Order
1. **Request parameters**: Explicit parameters in generation request
2. **Active preset**: Parameters from currently selected preset
3. **Base defaults**: System default values
4. **Provider defaults**: Provider-specific fallback values

## Bookmarks and currentNodeId

### Storage Rationale
**Persistence**: UI state persisted across application restarts
**User convenience**: Return to last viewed conversation/node
**Multiple conversations**: Per-root bookmark support

### Bookmark Behaviors
**Automatic updates**: Current node tracked as user navigates
**Validation**: Bookmarks verified to exist before use
**Cleanup**: Invalid bookmarks removed during validation
**Fallback**: Default to root node if bookmark invalid

### Data Structure
```toml
currentNodeId = "root_123_node_456"

[bookmarks]
"Conversation 1" = "root_123_node_789"
"Debug Session" = "root_456_node_123"
```

## MCP Servers Configuration

### Server Definition
```toml
[[mcpServers]]
name = "filesystem"
command = "npx"
args = ["@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]

[[mcpServers]]
name = "web"
command = "python"
args = ["-m", "mcp.server.web"]
env = { WEB_API_KEY = "..." }
```

### Configuration Fields
**name**: Unique identifier for MCP server (used in tool naming)
**command**: Executable command to start MCP server
**args**: Command line arguments array
**env**: Environment variables for MCP server process
**cwd**: Working directory for MCP server (optional)

### Server Management
**Lifecycle**: MCP servers started when configuration loaded
**Restart behavior**: Servers restarted if they crash
**Shutdown**: Clean shutdown when application exits

## Logging Configuration

### Log Scope
**Primary logger**: `loom.log` namespace for all application logging
**Sub-loggers**: Component-specific loggers (e.g., `loom.log.engine`, `loom.log.mcp`)
**External libraries**: Separate log streams, configurable levels

### Log Output
**File destination**: `{DATA_DIR}/loom.log`
**Rotation**: Basic size-based rotation (implementation pending)
**Levels**: Standard levels (error, warn, info, debug)
**Format**: Structured logging with timestamps and context

### Debug Mode
**Environment trigger**: `DEBUG=loom.log` enables debug logging
**Verbose output**: Additional context and trace information
**Performance impact**: Debug mode may affect performance

## Configuration Validation

### Startup Validation
**Required fields**: Validate presence of essential configuration
**Type checking**: Ensure configuration values have correct types
**Provider validation**: Check provider configurations for completeness
**Warning reporting**: Non-fatal configuration issues logged as warnings

### Runtime Validation
**Dynamic updates**: Configuration changes validated before application
**Backward compatibility**: Handle deprecated configuration fields gracefully
**Error recovery**: Fallback to defaults when configuration invalid

## Migration and Versioning

### Configuration Evolution
**Additive changes**: New fields added with sensible defaults
**Deprecation**: Old fields marked deprecated with migration path
**Breaking changes**: Major version bumps for incompatible changes

### Migration Process
**Automatic migration**: Convert deprecated formats to current schema
**Backup creation**: Preserve original configuration before migration
**User notification**: Inform users of configuration changes applied

## Non-goals

This specification does not cover:
- Complete TOML schema documentation (see code for definitive schema)
- Performance characteristics of configuration loading
- Advanced configuration templating or includes
- Multi-user configuration scenarios
- Configuration encryption or security beyond API key handling