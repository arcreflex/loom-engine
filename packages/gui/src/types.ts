import {
  Message,
  NodeData,
  NodeId,
  RootConfig,
  ProviderName
} from '@ankhdt/loom-engine';

export interface DisplayMessage extends Message {
  nodeId: NodeId;
  timestamp?: string; // Add timestamp property
  sourceProvider?: ProviderName; // Provider used to generate this message (for assistant messages)
  sourceModelName?: string; // Model used to generate this message (for assistant messages)
}

export interface GenerateOptions {
  n: number;
  max_tokens: number;
  temperature: number;
}

export interface AppState {
  currentNodeId: NodeId | null;
  messages: DisplayMessage[];
  root: RootConfig | null;
  children: NodeData[];
  siblings: NodeData[];
  isPending: boolean;
  error: string | null;
}

export type Command = {
  id: string;
  title: string;
  description?: string;
  execute: () => Promise<void>;
  disabled?: boolean;
};
