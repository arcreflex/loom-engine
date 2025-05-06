# Loom Engine

This is a TypeScript toolkit for managing interactions with LLMs based on a branching, tree-like history inspired by the "loom of time" concept. (If you're unfamiliar, here's [one entrance](https://www.lesswrong.com/posts/bxt7uCiHam4QXrQAA/cyborgism#Appendix__Testimony_of_a_Cyborg) to the rabbit hole.)

Note: this is primarily a personal project, so no guarantees about what kind of shape it's in.

## Core Concept & Motivation

A key facet of this implementation--and the main reason I wanted to make it, actually--is the use of prefix matching: when adding new messages, the engine reuses existing paths in the tree if the sequence of messages matches, only creating new nodes where the conversation diverges. The idea is that (almost) all of my LLM interactions -- from simple chats to long branching world sim explorations to anything in between -- can all live all in one place. (The multiverse should be navigable!)

## Packages

This monorepo contains the following key packages:

*   **`packages/engine` (`@ankhdt/loom-engine`):**
    The core library. It provides the data structures (Nodes, Roots, Messages), LLM provider integrations (OpenAI, Anthropic, Google), and the logic for managing conversation trees (the `Forest`).

*   **`packages/cli` (`@ankhdt/loom-cli`):**
    A command-line interface (CLI) for interacting with the Loom Engine. Built with Ink (React for CLIs), it offers a terminal-based way to navigate and extend conversations.

*   **`packages/gui` (`@ankhdt/loom-gui`):**
    A web-based graphical user interface (GUI) providing a richer, visual experience. It features a threaded conversation view, an interactive graph visualization of the conversation structure, and tools for managing different models and conversation parameters.

## Getting Started

### Prerequisites
*   Node.js (v20 or later recommended)
*   pnpm (package manager)

### Installation
1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd loom-engine-claude
    ```
2.  Install dependencies from the root of the monorepo:
    ```bash
    pnpm install
    ```

### Configuration
The Loom Engine stores its data and configuration in `~/.loom` by default.
*   **API Keys:** You'll need to configure your LLM provider API keys. Upon first run, a `config.toml` file will be created in `~/.loom/config.toml`. Edit this file to add your API keys for providers like OpenAI, Anthropic, or Google.
    ```toml
    # Example for ~/.loom/config.toml
    [providers.anthropic]
    apiKey = "sk-ant-..."

    [providers.openai]
    apiKey = "sk-..."

    [providers.google]
    apiKey = "..."
    ```
*   **Default Model:** You can also set a default model and other parameters in `config.toml`.

## Running the Applications

### CLI
From the root directory:
```bash
pnpm start -- --model <provider>/<model_name>
# Example: pnpm start -- --model anthropic/claude-3-opus-20240229
```
This will start the CLI, creating a new conversation with the specified model if one doesn't exist, or loading the last used conversation.

You can also run the CLI directly from its package directory:
```bash
cd packages/cli
pnpm start -- --model <provider>/<model_name>
```

### Web GUI
The Web GUI consists of a frontend (Vite) and a backend (Express server).

From the root directory:
```bash
pnpm start:gui
```
This command concurrently starts both the backend server (typically on port 3001) and the frontend development server (typically on port 3000).

Alternatively, from the `packages/gui` directory:
```bash
cd packages/gui
pnpm dev
```
Open your browser to `http://localhost:3000` (or the port indicated by Vite).
