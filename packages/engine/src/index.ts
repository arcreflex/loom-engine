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
  MessageLegacy,
  // V2 content-block message types
  NonEmptyArray,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  Message,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  NodeData,
  Node,
  RootData,
  Role
} from './types.ts';
export {
  isMessage,
  isContentBlock,
  isTextBlock,
  isNonEmptyTextBlock,
  isToolUseBlock,
  normalizeMessage,
  ToolArgumentParseError,
  isUserMessage,
  isAssistantMessage,
  isToolMessage,
  assertValidMessage,
  extractTextContent,
  extractToolUseBlocks,
  coalesceAdjacentTextBlocks
} from './content-blocks.ts';
export { coalesceTextOnlyAdjacent } from './engine-utils.ts';
export * from './tools/types.ts';
export { Forest } from './forest.ts';
export * from './config.ts';

// Re-export providers through a namespace
import * as providers from './providers/index.ts';
export { providers };
export * from './providers/known-models.ts';
export { parseModelString } from './parse-model-string.ts';
export { tailEngineLog, type LogTail, logPath } from './log.ts';
