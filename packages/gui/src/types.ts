import { Message, NodeData, NodeId, RootConfig } from '@ankhdt/loom-engine';

export interface DisplayMessage extends Message {
  nodeId: NodeId;
  timestamp?: string; // Add timestamp property
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
  category: string;
  execute: () => Promise<void>;
  disabled?: boolean;
};
