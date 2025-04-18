# Loom Engine

This is a TypeScript toolkit for managing interactions with LLMs based on a branching, tree-like history inspired by the "loom of time" concept. (If you're unfamiliar, here's [one entrance](https://www.lesswrong.com/posts/bxt7uCiHam4QXrQAA/cyborgism#Appendix__Testimony_of_a_Cyborg) to the rabbit hole.)

## Core Concept & Motivation

A key facet of this implementation--and the main reason I wanted to make it, actually--is the use of prefix matching: when adding new messages, the engine reuses existing paths in the tree if the sequence of messages matches, only creating new nodes where the conversation diverges. The idea is that I can then store *all* my LLM interactions -- from simple chats to long branching explorations to anything in between -- all in one place. The multiverse should be navigable!

## Packages:
* `@ankhdt/loom-engine`: The core library for managing the conversation trees.
* `@ankhdt/loom-cli`: A command-line interface for interacting with the engine.

## Installation

**Core Engine Library:**

```bash
pnpm install @ankhdt/loom-engine
# or npm install @ankhdt/loom-engine
# or yarn add @ankhdt/loom-engine
```

**Command-Line Interface:**

```bash
pnpm add -g @ankhdt/loom-cli
# or npm install -g @ankhdt/loom-cli
# or yarn global add @ankhdt/loom-cli
```

## Basic Usage

### Engine (`@ankhdt/loom-engine`)

```typescript
import { LoomEngine } from '@ankhdt/loom-engine';
import { FileSystemStore } from '@ankhdt/loom-engine/store'; // Note: Store path might change

// Initialize with a storage path
const engine = new LoomEngine('./my-loom-data');

// Define the root configuration for a conversation tree
const rootConfig = {
  provider: 'anthropic' as const, // or 'openai', etc.
  model: 'claude-3-haiku-20240307',
  systemPrompt: 'You are a helpful assistant.',
};

// User message(s)
const userMessages = [{ role: 'user' as const, content: 'Explain the loom concept.' }];

// Generate responses (returns an array of new assistant nodes)
const responseNodes = await engine.generate(rootConfig, userMessages, {
  n: 1, // Number of responses
  max_tokens: 500,
  temperature: 0.7,
});

if (responseNodes.length > 0) {
  const responseNode = responseNodes[0];
  console.log('Response:', responseNode.message.content);

  // Get the full history leading to this node
  const { messages } = await engine.getMessages(responseNode.id);
  console.log('Full History:', messages);
}
```

### CLI (`@ankhdt/loom-cli`)

The CLI provides a terminal-based interface to navigate and extend conversation trees managed by the engine.

```bash
# Start a new session (or continue the last one)
loom --model anthropic/claude-3-haiku-20240307 --system "You are a poet."
```

Inside the CLI, you can type messages to send to the LLM, use `/` commands to generate responses or navigate the tree (`/`, `/2`, `/siblings`, `/up`, `/save <bookmark>`, `/exit`).

## Development

This is a monorepo managed using pnpm workspaces.

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests for all packages
pnpm test

# Lint all packages
pnpm lint
```

## License

MIT

## Future Features

- [ ] Add generation parameter preset selection to the CLI interface.

## Credits

* [@repligate](https://x.com/repligate) for the original "loom of time" idea.
* [@parafactural](https://x.com/parafactural) for the Obsidian loom plugin ([github.com/cosmicoptima/loom](https://github.com/cosmicoptima/loom)).
* Sonnet 3.7 and Gemini Pro 2.5 for much of the code
