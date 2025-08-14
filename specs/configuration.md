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
├── config.*.toml         # Additional config files (merged lexically)
├── loom.log              # Application logs
└── <rootId>/             # Conversation data (no conversations/ folder)
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
[providers.anthropic]
apiKey = "your API key"

[providers.openai]
apiKey = "your API key"

[providers.google]
apiKey = "your API key"
projectId = "your project id"

[defaults]
model = "openai/gpt-4o"
temperature = 1
maxTokens = 1024
n = 5
systemPrompt = "You are a helpful assistant."
```

**Note**: Default config is created without comments and may be overwritten by user edits. No schema validation beyond basic type/shape checking. Does not include presets or openrouter section by default.

**Preset scope**: Presets change n/temperature/maxTokens only (not model or systemPrompt).

## Configuration Layering

### File Precedence (Highest to Lowest)
1. **Main config file**: `config.toml`
2. **Additional config files**: All other `config.*.toml` files merged in lexicographic order
3. **Built-in defaults**: Hardcoded fallback values

### Merge Strategy
**Lexical merge**: Load main config.toml, then merge all other config.*.toml files in lexicographic order
**Deep merge**: Nested objects combined, not replaced
**No NODE_ENV-specific precedence**: Current behavior merges all config files lexically

### Example Layering
Base `config.toml`:
```toml
[defaults]
model = "openai/gpt-4o"
temperature = 1.0
```

Additional `config.custom.toml`:
```toml
[defaults]
temperature = 0.7  # Override applied lexically
```

Result: Merged configuration uses gpt-4o model with 0.7 temperature.

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
Presets only support n, temperature, and maxTokens (not model or systemPrompt):
```toml
[presets.creative]
temperature = 1.5
maxTokens = 2048
n = 3

[presets.analytical]
temperature = 0.3
maxTokens = 512
n = 1
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
**Validation**: Bookmarks validated during delete flows (no global startup validation)
**Cleanup**: Invalid bookmarks removed during node deletion operations
**Fallback**: Default to root node if bookmark invalid

### Data Structure
Bookmarks are stored as an array of objects, not a TOML map:
```toml
currentNodeId = "root-1/node-2"

[[bookmarks]]
title = "Conversation 1"
rootId = "root-1"
nodeId = "root-1/node-3"
createdAt = "2024-01-01T00:00:00Z"
updatedAt = "2024-01-01T00:00:00Z"

[[bookmarks]]
title = "Debug Session"
rootId = "root-2"
nodeId = "root-2/node-1"
createdAt = "2024-01-01T00:00:00Z"
updatedAt = "2024-01-01T00:00:00Z"
```

## MCP Servers Configuration

### Server Definition
```toml
[[mcp_servers]]
name = "filesystem"
transport = "stdio"
command = "npx"
args = ["@modelcontextprotocol/server-filesystem", "/path/to/dir"]
env = { SOME_ENV = "value" }

[[mcp_servers]]
name = "web"
transport = "stdio"
command = "python"
args = ["-m", "mcp.server.web"]
```

### Configuration Fields
**name**: Unique identifier for MCP server (used in tool naming)
**transport**: Must be "stdio" (only transport currently implemented; "http" throws "not yet implemented")
**command**: Executable command to start MCP server
**args**: Command line arguments array
**env**: Environment variables for MCP server process (optional)
**Note**: Working directory is pinned to the data directory

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
**Format**: Simple append-only logging (no rotation, no levels)
**Implementation**: Single log file with basic timestamped entries

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