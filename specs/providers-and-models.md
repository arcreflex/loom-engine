# Providers and Models

Provider abstraction and model catalog behavior.

## Provider Interface (Behavioral)

All provider implementations must conform to a common behavioral interface for consistency across different AI services.

### Message Normalization
**Input**: Conversation history as Message[] from tree traversal
**Output**: Provider-specific message format

**Normalization responsibilities**:
- Convert role-based messages to provider format
- Handle null content in assistant messages
- Preserve tool call structure and IDs
- Apply provider-specific message constraints

### Tool Call Mapping

**Assistant Tool Calls → Provider Format**
- Map internal tool call structure to provider's tool calling format
- Preserve tool names, parameters, and correlation IDs
- Handle provider-specific tool call limitations

**Provider Response → Internal Format**
- Extract tool calls from provider response
- Generate correlation IDs for tool result matching
- Normalize tool call structure to internal format

**Tool Results Integration**
- Convert tool execution results to provider-expected format
- Maintain tool call ID correlation across conversation
- Handle tool execution errors in provider context

### Error Surface
**Provider-specific errors**: Network, authentication, rate limiting
**Normalization**: Convert to standard error categories
**Propagation**: Preserve enough detail for debugging while maintaining abstraction

## Tool-call Mapping Details

### Internal Tool Call Structure
```typescript
interface ToolCall {
  id: string;           // Correlation ID
  name: string;         // Tool function name
  parameters: object;   // JSON parameters
}
```

### Provider-specific Mappings

**OpenAI Format**
- Direct mapping to `tool_calls` array format
- Function name and arguments preserved
- Tool call IDs generated if not provided

**Anthropic Format**
- Maps to `tool_use` content blocks
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
**Purpose**: Centralized knowledge of model capabilities and limits

**Model entries include**:
- Context window size (max input tokens)
- Maximum output tokens
- Tool calling support
- Streaming capabilities
- Cost information (optional)

### Capability Detection
**Known models**: Use catalog data for parameter selection
**Unknown models**: Apply conservative fallback limits
**Provider detection**: Infer capabilities from model string format

### Fallback Behavior
When model not in catalog:
- Use provider default context limits
- Assume basic tool calling support
- Apply conservative token estimation
- Log unknown model for future catalog addition

## Parameter Shaping Rules

### Temperature Validation
- **Range enforcement**: 0.0 to 2.0 (provider-specific limits applied)
- **Provider mapping**: Some providers use different temperature scales
- **Default handling**: Use configuration defaults when not specified

### max_tokens Bounds
**Upper bounds**: Model context limit minus estimated input tokens
**Lower bounds**: Minimum viable response length
**Safety margins**: Account for provider token counting variations

**Calculation process**:
1. Estimate input token count from message history
2. Subtract from model's known context limit
3. Apply safety margin (10-20% buffer)
4. Enforce provider-specific maximum output limits

### Safety Limits
- **Prevent runaway generation**: Cap max_tokens at reasonable levels
- **Cost protection**: Warn or limit expensive operations
- **Rate limiting awareness**: Back off on provider rate limits

### Provider-specific Parameter Mappings
**OpenAI**: Direct parameter mapping
**Anthropic**: Maps max_tokens to max_tokens_to_sample
**Google**: Converts to generationConfig format

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

### Provider Detection
1. Split model string on first `/`
2. Use first part as provider identifier
3. Pass remainder as model name to provider
4. Handle legacy formats and aliases

### Unknown Provider Handling
- Error on completely unknown providers
- Suggest closest matching provider
- Provide list of supported providers

## Non-goals

This specification does not cover:
- Specific SDK implementation details
- Provider API rate limiting strategies
- Cost optimization techniques
- Model performance comparisons
- Provider-specific authentication mechanisms beyond API keys