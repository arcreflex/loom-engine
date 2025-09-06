# Providers and Models

Provider abstraction and model catalog behavior.

## Provider Interface (Behavioral, V2-only)

All provider implementations must conform to a common behavioral interface for consistency across different AI services.

### Message Normalization (V2)

**Input**: Conversation history as `MessageV2[]` with `content: ContentBlock[]`
**Output**: Provider-specific message payloads

**Normalization responsibilities**:

- Convert role-based messages and content blocks to provider format
- Map internal `tool-use` blocks to provider tool call representations
- Preserve tool correlation IDs across request/response cycles
- Apply provider-specific message constraints

### Tool Choice Semantics

**Supported values**:

- `'auto'`: Model decides whether to call tools
- `'none'`: Model must not call any tools
- `{ type: 'function', function: { name: string } }`: Model must call specific named tool

**Note**: `'required'` tool choice is not supported in current implementation.

### Tool Call Mapping

**Assistant `tool-use` blocks → Provider Format**

- Map internal `tool-use` content blocks to provider tool calling format
- Preserve tool names, parameters, and correlation IDs
- Handle provider-specific tool call limitations

**Provider Response → Internal Format**

- Extract tool call information from provider responses
- Normalize into `content` blocks: `{ type: 'tool-use', id, name, parameters }` alongside any text blocks
- Preserve/copy provider-issued correlation IDs without synthesizing new ones

**Tool Results Integration**

- Convert tool execution string results to provider-expected format for next turn
- Maintain correlation via `tool_call_id` on tool messages
- Handle tool execution errors in provider context

### Error Surface

**Provider-specific errors**: Network, authentication, rate limiting
**Normalization**: Convert to standard error categories
**Propagation**: Preserve enough detail for debugging while maintaining abstraction

## Tool-call Mapping Details

### Internal Tool Use Block Structure

```typescript
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool-use'; id: string; name: string; parameters: object };
```

### Provider-specific Mappings

**OpenAI Format**

- Map `tool-use` blocks to OpenAI `tool_calls` array on assistant messages
- Function name and arguments preserved
- Tool call IDs come from provider responses and are preserved

**Anthropic Format**

- Directly uses `tool_use` content blocks
- Preserves tool name and input parameters
- Uses block ID for correlation

**Google Format**

- Converts to function call format
- Parameter mapping to Google's schema requirements
- Handles response format differences

### Bidirectional Conversion

1. **Request phase**: Internal → Provider format
2. **Response phase**: Provider → Internal format
3. **Tool result phase**: Results → Provider format for next request

## Model Catalog (KNOWN_MODELS)

### Model Capabilities Database

**Purpose**: Best-effort catalog used to cap max_tokens; entries are advisory, not exhaustive. KNOWN_MODELS is not a restrictive list - unknown models fall back to conservative limits.

**Model entries include**:

- Context window size (max input tokens)
- Maximum output tokens
- Tool calling support
- Streaming capabilities
- Cost information (optional)

### Capability Detection

**Known models**: Use catalog data for parameter selection
**Unknown models**: Fall back to conservative limits
**Provider detection**: Infer capabilities from model string format

### Fallback Behavior

When model not in catalog:

- Apply conservative fallback limits (model capabilities unknown)
- Assume basic tool calling support
- Use conservative token estimation with character-based heuristic
- Catalog entries are advisory for optimization, not restrictive

## Parameter Shaping Rules

### Temperature Validation

- **Range enforcement**: 0.0 to 2.0 (provider-specific limits applied)
- **Provider mapping**: Some providers use different temperature scales
- **Default handling**: Use configuration defaults when not specified

### max_tokens Bounds

**Upper bounds**: Model context limit minus estimated input tokens
**Lower bounds**: Minimum viable response length
**Safety margins**: Account for provider token counting variations

**Token estimation**: Heuristic of approximately 0.3 tokens per input character
**Calculation process**:

1. Estimate input token count from message history using character-based heuristic
2. Subtract from model's known context limit (if available)
3. Clamp max_tokens by model capabilities and estimated residual window
4. Enforce provider-specific maximum output limits
5. **Parameter constraint**: Unknown models use conservative caps; engine clamps effective `max_tokens` to ≥ 1 when residual capacity is ≤ 0. A fail‑early option may be introduced in the future.

### Safety Limits

- **Prevent runaway generation**: Cap max_tokens at reasonable levels
- **Cost protection**: Warn or limit expensive operations
- **Rate limiting awareness**: Back off on provider rate limits

### Provider-specific Parameter Mappings

Each provider adapter maps the internal parameter set {temperature, max_tokens, ...} to its native API format. Conservative max_tokens clamping rules are enforced uniformly across providers. See code for exact parameter names and mappings.

## Adding a Provider

### Minimal Implementation Steps

1. **Create provider class** in `packages/engine/src/providers/`
2. **Implement interface methods**:
   - `generate(request)`: Core generation method
   - `normalizeMessages(messages)`: Message format conversion
   - `mapToolCalls(toolCalls)`: Tool call formatting

3. **Update type definitions**:
   - Add to `ProviderName` union type
   - Update model string parsing logic

4. **Register in LoomEngine**:
   - Add case in `getProvider()` method
   - Include in provider instantiation logic

5. **Add configuration support**:
   - Define config section in schema
   - Add API key environment variable mapping
   - Document required configuration fields

### Interface Expectations

**Error handling**: Consistent error categories across providers
**Streaming support**: Optional but preferred for real-time generation
**Tool integration**: Must support tool calling if provider offers it
**Authentication**: Handle API keys and authentication tokens securely

### Testing Requirements

- **Unit tests**: Provider-specific logic and edge cases
- **Integration tests**: End-to-end generation with real or mocked API
- **Error scenarios**: Network failures, authentication errors, rate limits

## Model String Format

### Parsing Convention

Format: `{provider}/{model-name}`
Examples:

- `openai/gpt-4o`
- `anthropic/claude-3-sonnet`
- `google/gemini-pro`
- `openrouter/moonshotai/kimi-k2`

### Supported Providers

**Current providers**: openai, anthropic, google, openrouter
**Model string format**: `{provider}/{model-name}` (e.g., "openai/gpt-4o", "openrouter/anthropic/claude-3-sonnet")
**OpenRouter note**: Uses OpenAIProvider implementation with custom baseURL and API key

### Provider Detection

1. Split model string on first `/`
2. Use first part as provider identifier
3. Pass remainder as model name to provider

### Unknown Provider Handling

- Error on completely unknown providers
- Suggest closest matching provider
- Provide list of supported providers

## Known Limitations

### Content Block Ordering

**OpenAI and Google Providers**: These providers' APIs return text content and tool calls as separate fields rather than as an interleaved array of content blocks. As a result:

- We append text blocks first, then tool-use blocks when converting responses to V2 format
- The exact interleaving of text/tool/text content cannot be preserved if that was the model's intent
- This is a limitation of the underlying provider APIs, not our implementation
- Anthropic's API natively supports interleaved content blocks and preserves ordering correctly

**Text Block Concatenation**: When multiple text blocks need to be joined (e.g., for providers that expect a single text string):

- Text blocks are joined with newline characters (`\n`) to preserve formatting
- This is important for code blocks, paragraphs, and other formatted content
- User and tool messages should ideally contain only a single text block

**Google Tool Results**: The Google Gemini API expects function responses to be objects. Since our tools return strings, we wrap string results in `{ result: <string> }` format to conform to Google's API requirements while preserving the tool output. Additionally, Google expects function responses to be sent with role `'user'` (not `'model'`), as they represent the user-side providing results back to the model.

**Google Tool Name Collisions**: The Google Gemini API does not preserve tool call IDs in its responses, making it impossible to correlate tool results when multiple calls to the same function occur in a single message. The provider will fail loudly if this scenario is detected, throwing a `GoogleDuplicateFunctionError` that explains the limitation.

**Google UUID Generation**: When Google's API returns function calls without IDs, the provider generates deterministic UUIDs using `crypto.randomUUID()` for correlation. These IDs are:

- Ephemeral and only valid within the single request/response cycle
- Used solely for correlating the immediate tool result back to the function call
- Not persisted or relied upon in subsequent conversation turns
- Generated with format: `google-tool-{uuid}`

## Non-goals

This specification does not cover:

- Specific SDK implementation details
- Provider API rate limiting strategies
- Cost optimization techniques
- Model performance comparisons
- Provider-specific authentication mechanisms beyond API keys
