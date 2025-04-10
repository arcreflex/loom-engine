# Loom CLI

Command line interface for the Loom Engine.

## Installation

```bash
# For development
pnpm link --global

# After publishing
pnpm add -g @loom/cli
```

## Usage

```bash
# Start a new session
loom --model anthropic/claude-3-haiku-20240307 --system "You are a helpful assistant."

# Start with custom data directory
loom --data-dir ~/.my-loom-data
```

## Commands

- `/` - Generate a response (with default settings)
- `/N` - Generate N responses
- `/siblings` - List and select sibling nodes
- `/parent` - Move to parent node
- `/save [title]` - Save the current node as a bookmark
- `/exit` - Exit the CLI