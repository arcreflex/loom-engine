import type { ProviderRequest } from './providers/types.ts';

/**
 * Represents a unique identifier for a node in the loom.
 */
export type NodeId = string & { readonly __nodeIdBrand: unique symbol };

/**
 * Represents a unique identifier for a root in the loom.
 */
export type RootId = NodeId & { readonly __rootIdBrand: unique symbol };

/**
 * Represents the role of a message in a conversation.
 */
export type Role = 'user' | 'assistant' | 'tool';

export type ProviderName = 'openai' | 'anthropic' | 'google' | 'openrouter';

export interface UserMessage {
  role: 'user';
  content: string | null;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: {
    id: string; // A unique ID for this specific tool call.
    type: 'function'; // The type of tool call, always 'function' for now.
    function: {
      name: string; // The name of the function to be called.
      arguments: string; // A JSON string of arguments for the function.
    };
  }[];
}

export interface ToolMessage {
  role: 'tool';
  content: string | null;
  tool_call_id: string;
}

export type Message = UserMessage | AssistantMessage | ToolMessage;

/**
 * Configuration for a conversation root.
 */
export interface RootConfig {
  /** Optional system prompt to initialize the conversation. */
  systemPrompt?: string;
}

/**
 * Extended information about a conversation root, including its ID and creation timestamp.
 */
export interface RootData {
  /** The unique identifier for this root. */
  id: RootId;

  parent_id?: undefined;
  child_ids: NodeId[];

  /** The timestamp when this root was created (ISO 8601 format). */
  createdAt: string;
  deleted?: boolean;

  config: RootConfig;
}

export type ModelSourceInfo = {
  type: 'model';
  provider: ProviderName;
  model_name: string;
  parameters: ProviderRequest['parameters'];
  tools?: ProviderRequest['tools'];
  tool_choice?: ProviderRequest['tool_choice'];
  finish_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    raw?: unknown;
  };
};

export type SourceInfo =
  | ModelSourceInfo
  | {
      type: 'user';
    }
  | {
      type: 'tool_result';
      tool_name: string; // The name of the tool that was executed.
    };

/**
 * Metadata associated with a node in the conversation tree.
 */
export interface NodeMetadata {
  /** The timestamp when this node was created (ISO 8601 format). */
  timestamp: string;

  /** The original root ID when the node was first created (may differ from current root_id if cloned). */
  original_root_id: RootId;

  source_info: SourceInfo;

  /** Optional tags for categorizing or filtering nodes. */
  tags?: string[];

  /** Additional custom data associated with this node. */
  custom_data?: Record<string, unknown>;

  split_source?: NodeId;
}

/**
 * Represents a node in the conversation tree, containing messages and structural information.
 */
export interface NodeData {
  /** The unique identifier for this node. */
  id: NodeId;

  /** The current root ID this node belongs to. */
  root_id: RootId;

  /** The parent node's ID, or null if this is a root node. */
  parent_id: NodeId;

  /** The IDs of child nodes. */
  child_ids: NodeId[];

  message: Message;

  /** Metadata associated with this node. */
  metadata: NodeMetadata;
}

export type Node = RootData | NodeData;

export function getToolCalls(message: Message) {
  return message.role === 'assistant' ? message.tool_calls : undefined;
}
