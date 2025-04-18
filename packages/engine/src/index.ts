/**
 * Loom Engine - A TypeScript library for managing interactions with language models
 * based on the "loom of time" concept.
 *
 * @module loom-engine
 */

export * from './engine.ts';
export type {
  NodeId,
  RootId,
  ProviderName,
  RootConfig,
  Message,
  NodeData,
  Node,
  RootData,
  Role
} from './types.ts';
export { coalesceMessages } from './coalesce-messages.ts';
export { Forest } from './forest.ts';
export * from './config.ts';

// Re-export providers through a namespace
import * as providers from './providers/index.ts';
export { providers };
export * from './providers/known-models.ts';
export { parseModelString } from './parse-model-string.ts';
