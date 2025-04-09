# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**! IMPORTANT !** If at any point the user says "(note this)", you should stop and make a note in this file (CLAUDE.md), recording whatever important information, guidelines, or context the user is referring to. It's likely best to commit the change to this note immediately after doing so (without mixing it with other changes).


## Project: Loom Engine

A TypeScript library for managing interactions with language models based on the "loom of time" concept, supporting branching conversations, different LLM providers, and persistent storage.

## Project Plan

The project plan is at ./PLAN.md.

## Build Commands
- Install: `pnpm install`
- Build: `pnpm build` (runs TypeScript compiler)
- Dev mode: `pnpm dev` (watches for changes)
- Lint: `pnpm lint` (runs ESLint)
- Format: `pnpm format` (runs Prettier)
- Test: `pnpm test`
- Run TypeScript: `node packages/loom-engine/src/example.ts` (Node.js can run TypeScript files directly without transpilation)

## Code Style Guidelines
- Language: TypeScript with strict mode
- Package manager: pnpm (monorepo structure)
- Formatting: Prettier (default configuration)
- Linting: ESLint with Prettier integration
- Naming: camelCase for variables/functions, PascalCase for classes/interfaces
- Imports: Group imports by source (internal, external)
- Error handling: Use async/await with try/catch blocks
- Documentation: TSDoc comments for all public APIs
- File structure: Keep related code in the same directory
- Testing: Unit tests using Node's built-in test framework (mock external dependencies)

## Testing Guidelines
- ALWAYS prioritize fixing the code if a test reveals an issue rather than modifying the test to pass
- Tests should drive improvements in the code, not the other way around
- If a test is failing, it's usually revealing a legitimate issue that should be fixed