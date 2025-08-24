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
  // V2 content-block message types
  NonEmptyArray,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  MessageV2,
  UserMessageV2,
  AssistantMessageV2,
  ToolMessageV2,
  NodeData,
  Node,
  RootData,
  Role
} from './types.ts';
export {
  isMessageV2,
  isContentBlock,
  isTextBlock,
  isNonEmptyTextBlock,
  isToolUseBlock,
  legacyToContentBlocks,
  normalizeMessage,
  ToolArgumentParseError
} from './content-blocks.ts';
export * from './tools/types.ts';
export { coalesceMessages } from './coalesce-messages.ts';
export { Forest } from './forest.ts';
export * from './config.ts';

// Re-export providers through a namespace
import * as providers from './providers/index.ts';
export { providers };
export * from './providers/known-models.ts';
export { parseModelString } from './parse-model-string.ts';
