# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Test: `pnpm test` (runs Jest or Vitest)

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
- Testing: Unit tests with Jest/Vitest (mock external dependencies)
