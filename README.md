# Loom Engine

A TypeScript library for managing interactions with language models based on the "loom of time" concept.

## Installation

```bash
npm install @loom/engine
```

If you plan to use the Anthropic provider:

```bash
npm install @loom/engine @anthropic-ai/sdk
```

## Usage

### Basic Example

```typescript
import { Forest } from '@loom/engine';
import { FileSystemLoomStore } from '@loom/engine/store';

// Initialize the forest with a store
const store = new FileSystemLoomStore('./data');
const forest = new Forest(store);

// Create or get a root
const root = await forest.getOrCreateRoot({
  model: 'claude-3-opus-20240229',
  providerType: 'anthropic'
});

// Create a node with a message
const userNode = await forest.append(
  root.id,
  [{ role: 'user', content: 'Tell me about the loom of time concept.' }],
  { source_info: { type: 'user' } }
);

// Get the full conversation history
const { messages } = await forest.getMessages(userNode.id);
```

### Using the Anthropic Provider

```typescript
import { AnthropicProvider } from '@loom/engine/providers';
import { coalesceMessages } from '@loom/engine';

// Initialize with API key from environment variable (ANTHROPIC_API_KEY)
const anthropic = new AnthropicProvider();

// Or provide API key directly
// const anthropic = new AnthropicProvider('your-api-key');

// Retrieve messages from the forest
const { messages } = await forest.getMessages(nodeId);

// Coalesce messages to reduce token usage
const coalescedMessages = coalesceMessages(messages);

// Generate a response
const response = await anthropic.generate({
  messages: coalescedMessages,
  model: 'claude-3-opus-20240229',
  parameters: {
    max_tokens: 1000,
    temperature: 0.7
  }
});

// Append the response to the conversation
const newNode = await forest.append(
  nodeId,
  [response.message],
  { 
    source_info: {
      type: 'model',
      parameters: { max_tokens: 1000, temperature: 0.7 },
      finish_reason: response.finish_reason,
      usage: response.usage
    }
  }
);
```

## Features

- Tree-based conversation management
- Multiple conversation branches
- Node splitting and deletion
- Message coalescing
- Support for multiple LLM providers
- Filesystem storage

## License

MIT