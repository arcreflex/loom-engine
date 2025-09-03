import {
  Node,
  NodeData,
  NodeId,
  ProviderName,
  // V2 content-block message types
  MessageV2
} from '@ankhdt/loom-engine';

export const PENDING_GENERATION = Symbol('PENDING_GENERATION');

type GenerationRequestStatus = 'pending' | 'idle' | 'error';
export type GenerationRequestUpdate = {
  status: GenerationRequestStatus;
  added?: NodeData[];
  error?: string;
};

export type GetNodeResponse = Node & {
  contextTokens?: number;
  pendingGeneration?: { status: 'pending' | 'idle' };
};

export type DisplayMessage = MessageV2 & {
  nodeId: NodeId;
  timestamp?: string; // Add timestamp property
  sourceProvider?: ProviderName; // Provider used to generate this message (for assistant messages)
  sourceModelName?: string; // Model used to generate this message (for assistant messages)
};

export interface GenerateOptions {
  n: number;
  max_tokens: number;
  temperature: number;
}

export type Command = {
  id: string;
  title: string;
  description?: string;
  execute: () => Promise<void>;
  disabled?: boolean;
};
