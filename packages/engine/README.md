# Loom Engine

**Loom Engine** is a TypeScript library designed for managing complex, non-linear interactions with Large Language Models (LLMs). Inspired by the "loom of time" concept, it represents conversations not as single threads, but as branching trees (a "forest") where different conversational paths can be explored, persisted, and manipulated.

It facilitates advanced use cases like comparing multiple model responses, exploring alternative phrasings, backtracking, and maintaining a structured history of interactions across various LLM providers.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Key Features](#key-features)
- [Data Structures](#data-structures)
- [Installation](#installation)
- [Usage](#usage)
  - [Initialization](#initialization)
  - [Generating Responses](#generating-responses)
  - [Retrieving Conversation History](#retrieving-conversation-history)
  - [Tree Manipulation (Advanced)](#tree-manipulation-advanced)
- [Storage](#storage)
  - [File System Store](#file-system-store)
  - [Custom Stores](#custom-stores)
- [Providers](#providers)
- [Development](#development)
- [Future Work](#future-work)
- [Contributing](#contributing)
- [License](#license)

## Core Concepts

-   **Forest:** The top-level container, holding multiple conversation trees. Managed by the `Forest` class.
-   **Root:** The starting point of a specific conversation tree. Defined by a unique `RootConfig` (provider, model, system prompt, etc.). Each root has a unique ID.
-   **Node:** A point in the interaction history within a tree. Each node contains a single `Message` and links to its parent and children. Nodes store metadata about their creation (timestamp, source, etc.).
-   **Path:** The sequence of nodes from the root to any given node defines the complete message history or context for that point in the conversation.
-   **Branching:** A node can have multiple children, representing different responses or continuations from that point in the conversation (e.g., multiple `n` generations from an LLM, or different user inputs).
-   **Prefix Matching:** When adding new messages (`append`), the system efficiently reuses existing paths. If a sequence of messages being added starts with the same messages as an existing child path, the system follows the existing path until the messages diverge, only creating new nodes for the differing part.
-   **Storage:** The state of the forest (roots and nodes) can be persisted, allowing conversations to be saved and resumed. The default implementation uses the file system.

## Key Features

-   **Tree-Based History:** Manages conversations as trees, enabling non-linear interaction exploration.
-   **Branching & Exploration:** Easily generate multiple responses (`n > 1`) from the same context or manually create branches.
-   **Provider Agnostic:** Designed to work with different LLM providers (currently skeleton for OpenAI, extendable via `IProvider` interface).
-   **Persistent Storage:** Includes a file system-based store (`FileSystemStore`) and an `ILoomStore` interface for custom storage solutions.
-   **Prefix Matching:** Efficiently reuses existing nodes when appending messages that share a common history.
-   **Node Splitting:** Split a single message node into two connected nodes at a specific text position (`splitNode`). Useful for editing or inserting content mid-message.
-   **Tree Manipulation:** Programmatically delete nodes (`deleteNode`), prune branches by removing siblings (`deleteSiblings`), or remove entire subtrees (`deleteChildren`).
-   **Message Coalescing:** Utility (`coalesceMessages`) to combine adjacent messages from the same role, often required by LLM APIs.

## Data Structures

Key types defined in `src/types.ts`:

-   **`Message`**: `{ role: Role; content: string; }` where `Role` is 'system', 'user', 'assistant', or 'tool'.
-   **`RootConfig`**: `{ providerType: ProviderType; model: string; systemPrompt?: string; }` Defines the LLM configuration for a tree.
-   **`RootData`**: Represents a persisted root, including `id`, `createdAt`, `config`, and `child_ids`. It's also the starting `Node`.
-   **`NodeData`**: Represents a non-root node in the tree, containing `id`, `root_id`, `parent_id`, `child_ids`, the `message`, and `metadata`.
-   **`NodeMetadata`**: `{ timestamp: string; original_root_id: RootId; source_info: SourceInfo; tags?: string[]; custom_data?: Record<string, any>; }` Contains information about the node's creation and context.
-   **`SourceInfo`**: Describes how the node was created (e.g., `{ type: 'model', ... }`, `{ type: 'user' }`, `{ type: 'split' }`).


## Usage

### Initialization

Instantiate the `LoomEngine`. You can provide a path for the default `FileSystemStore` or pass your own implementation of `ILoomStore`.

```typescript
import { LoomEngine } from '@loom/engine';

// Option 1: Use the default FileSystemStore
const dataDirectory = './my-loom-data';
const engine = new LoomEngine(dataDirectory);

// Option 2: Use a custom store (implementing ILoomStore)
// import { MyCustomStore } from './my-custom-store';
// const customStore = new MyCustomStore();
// await customStore.initialize(); // If needed
// const engine = new LoomEngine(customStore);
```

### Generating Responses

Use the `generate` method to get completions from an LLM. It handles creating roots, appending user messages, calling the provider, and appending assistant messages.

```typescript
import { LoomEngine, RootConfig, Message } from '@loom/engine';

const engine = new LoomEngine('./my-loom-data');

const rootConfig: RootConfig = {
  providerType: 'openai', // Requires configuring the OpenAIProvider
  model: 'gpt-4-turbo',
  systemPrompt: 'You are a helpful assistant.',
};

const userMessages: Message[] = [
  { role: 'user', content: 'Explain the concept of a "black hole" in simple terms.' }
];

const generationOptions = {
  n: 1, // Number of responses to generate
  max_tokens: 150,
  temperature: 0.7
};

try {
  // generate returns an array of the newly created assistant message nodes
  const assistantNodes = await engine.generate(rootConfig, userMessages, generationOptions);

  if (assistantNodes.length > 0) {
    const firstResponseNode = assistantNodes[0];
    console.log('Assistant Response:', firstResponseNode.message.content);
    console.log('Response Node ID:', firstResponseNode.id);

    // You can now use firstResponseNode.id to continue the conversation
  }
} catch (error) {
  console.error('Error generating response:', error);
  // Note: OpenAIProvider needs implementation/API key setup
}
```

### Retrieving Conversation History

Get the full path of messages leading up to a specific node.

```typescript
import { LoomEngine, NodeId } from '@loom/engine';

const engine = new LoomEngine('./my-loom-data');

async function printHistory(nodeId: NodeId) {
  try {
    const { root, messages } = await engine.getMessages(nodeId);

    console.log('--- Conversation History ---');
    console.log('Root Config:', root);
    messages.forEach(msg => {
      console.log(`[${msg.role}]: ${msg.content}`);
    });
    console.log('--------------------------');
  } catch (error) {
    console.error(`Error retrieving history for node ${nodeId}:`, error);
  }
}

// Assuming 'responseNodeId' is an ID obtained from a previous generate call
// const responseNodeId = firstResponseNode.id;
// await printHistory(responseNodeId);
```

### Tree Manipulation (Advanced)

The underlying `Forest` object provides methods to directly manipulate the conversation trees. Access it via `engine.getForest()`.

```typescript
import { LoomEngine, NodeId, Message } from '@loom/engine';

const engine = new LoomEngine('./my-loom-data');
const forest = engine.getForest();

// Example: Appending a message manually (e.g., user correction)
async function appendManually(parentId: NodeId, message: Message) {
  const newNode = await forest.append(parentId, [message], {
    source_info: { type: 'user' } // Or other appropriate source
  });
  console.log('Manually appended node:', newNode.id);
  return newNode;
}

// Example: Splitting a node's message
async function splitNodeMessage(nodeId: NodeId, splitPosition: number) {
  // Note: This modifies the original node and creates a new child node
  const modifiedOriginalNode = await forest.splitNode(nodeId, splitPosition);
  console.log('Node split. Original node content:', modifiedOriginalNode.message.content);
  const newNodeId = modifiedOriginalNode.child_ids[0]; // ID of the node with the rest of the content
  const newNode = await forest.getNode(newNodeId);
  console.log('New node content:', newNode?.message.content);
  return { modifiedOriginalNode, newNode };
}

// Example: Deleting a node (and orphaning its children by default)
async function deleteSingleNode(nodeId: NodeId) {
  await forest.deleteNode(nodeId);
  console.log('Node deleted:', nodeId);
}

// Example: Deleting a node and reparenting its children to the grandparent
async function deleteAndReparent(nodeId: NodeId) {
  await forest.deleteNode(nodeId, true); // Pass true to reparent
  console.log('Node deleted and children reparented:', nodeId);
}

// Example: Deleting all siblings of a node (pruning other branches)
async function pruneBranches(keepNodeId: NodeId) {
    await forest.deleteSiblings(keepNodeId);
    console.log('Deleted siblings of node:', keepNodeId);
}

// Example: Deleting all children of a node
async function deleteSubtree(nodeId: NodeId) {
    await forest.deleteChildren(nodeId);
    console.log('Deleted children of node:', nodeId);
}
```

## Storage

### File System Store

The default storage mechanism (`FileSystemStore`) saves loom data to the local file system within the specified base directory.

-   `<basePath>/roots.json`: An index of all root configurations and their IDs.
-   `<basePath>/<rootId>/nodes/`: Directory containing individual node files.
-   `<basePath>/<rootId>/nodes/<nodeId>.json`: JSON file storing the data for a single node (`NodeData`).

### Custom Stores

You can implement custom storage solutions (e.g., database, cloud storage) by creating a class that implements the `ILoomStore` interface (defined in `src/store/types.ts`). Pass an instance of your custom store to the `LoomEngine` constructor.

## Providers

Loom Engine uses an `IProvider` interface (`src/providers/types.ts`) to interact with different LLM APIs.

-   **OpenAI:** An `OpenAIProvider` class exists (`src/providers/openai.ts`), but the `generate` method is currently a placeholder. You will need to install the `openai` SDK and complete the implementation (or use a community-provided one) with your API key.
-   **Other Providers:** Support for other providers (Anthropic, Google, etc.) can be added by creating new classes that implement `IProvider`.

The `LoomEngine` selects the appropriate provider based on the `providerType` in the `RootConfig`.

## Development

Ensure `pnpm` is installed.

```bash
# Install dependencies
pnpm install

# Build the library (compile TS to JS)
pnpm build

# Watch mode (rebuild on changes)
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

# Run the example directly (Node.js can run TS)
node packages/loom-engine/src/example.ts
```

## Future Work
 - (Optionally) ask a smaller model to make a title at a node
 - Explore taking a set of completions at a node, sending them to a model, and asking it to characterize/contrast the feel/flavors/vibe of each completion
 - Web UI
 - Quick render-to-text tooling


## Credits

 - [@repligate](https://x.com/repligate) and GPT-3 (I think) for the original idea of the loom of time
 - [@parafactural](https://x.com/parafactural) for a really nice Obsidian loom plugin (https://github.com/cosmicoptima/loom)
 - Sonnet 3.7 and Gemini Pro 2.5 for much of the code