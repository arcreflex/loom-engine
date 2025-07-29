import {
  Bookmark,
  Config,
  Message,
  NodeData,
  Node,
  NodeId,
  Role,
  RootConfig,
  RootData,
  RootId,
  ProviderName,
  ToolInfo
} from '@ankhdt/loom-engine';
import type { DisplayMessage, GenerateOptions } from './types';

/**
 * Represents the minimal structure of a node for graph visualization.
 */
export interface NodeStructure {
  id: NodeId;
  parent_id: NodeId | null; // null for roots
  child_ids: NodeId[];
  root_id: RootId;
  timestamp: string;
  role: Role | 'system'; // Include role for styling
}

// Generation preset parameters
export type PresetDefinition = Partial<
  Pick<GenerateOptions, 'n' | 'temperature' | 'max_tokens'>
>;

export interface PresetConfig {
  presets: { [name: string]: PresetDefinition };
  activePresetName: string | null;
}

// API client for interacting with the backend

// Common fetch wrapper with error handling
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(
      errorData.error || `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}

function encode(str: string) {
  return encodeURIComponent(str);
}

// API endpoints

export async function getState(): Promise<{ currentNodeId: NodeId | null }> {
  return fetchApi<{ currentNodeId: NodeId | null }>('/api/state');
}

export async function setState(
  currentNodeId: NodeId
): Promise<{ currentNodeId: NodeId }> {
  return fetchApi<{ currentNodeId: NodeId }>('/api/state', {
    method: 'PUT',
    body: JSON.stringify({ currentNodeId })
  });
}

export async function getNode(nodeId: NodeId): Promise<Node> {
  return fetchApi<Node>(`/api/nodes/${encode(nodeId)}`);
}

export async function getPath(
  nodeId: NodeId
): Promise<{ root: RootConfig; messages: DisplayMessage[] }> {
  return fetchApi<{ root: RootConfig; messages: DisplayMessage[] }>(
    `/api/nodes/${encode(nodeId)}/path`
  );
}

export async function getChildren(nodeId: NodeId): Promise<NodeData[]> {
  return fetchApi<NodeData[]>(`/api/nodes/${encode(nodeId)}/children`);
}

export async function getSiblings(nodeId: NodeId): Promise<NodeData[]> {
  return fetchApi<NodeData[]>(`/api/nodes/${encode(nodeId)}/siblings`);
}

export async function appendMessage(
  parentId: NodeId,
  role: Role,
  content: string
): Promise<NodeData> {
  return fetchApi<NodeData>(`/api/nodes/${encode(parentId)}/append`, {
    method: 'POST',
    body: JSON.stringify({ role, content })
  });
}

export async function generateCompletion(
  nodeId: NodeId,
  providerName: ProviderName,
  modelName: string,
  options: Partial<GenerateOptions>,
  activeTools?: string[]
): Promise<NodeData[]> {
  return fetchApi<NodeData[]>(`/api/nodes/${encode(nodeId)}/generate`, {
    method: 'POST',
    body: JSON.stringify({ providerName, modelName, activeTools, ...options })
  });
}

export async function editNodeContent(
  nodeId: NodeId,
  content: string
): Promise<NodeData> {
  return fetchApi<NodeData>(`/api/nodes/${encode(nodeId)}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content })
  });
}

export async function deleteNode(
  nodeId: NodeId
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/api/nodes/${encode(nodeId)}`, {
    method: 'DELETE'
  });
}

export async function deleteSiblings(
  nodeId: NodeId
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(
    `/api/nodes/${encode(nodeId)}/siblings`,
    {
      method: 'DELETE'
    }
  );
}

export async function deleteChildren(
  nodeId: NodeId
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(
    `/api/nodes/${encode(nodeId)}/children`,
    {
      method: 'DELETE'
    }
  );
}

export async function listRoots(): Promise<RootData[]> {
  return fetchApi<RootData[]>('/api/roots');
}

export async function createRoot(config: RootConfig): Promise<RootConfig> {
  return fetchApi<RootConfig>('/api/roots', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function listBookmarks(): Promise<Bookmark[]> {
  return fetchApi<Bookmark[]>('/api/bookmarks');
}

export async function saveBookmark(
  title: string,
  nodeId: NodeId,
  rootId: RootId
): Promise<Bookmark> {
  return fetchApi<Bookmark>('/api/bookmarks', {
    method: 'POST',
    body: JSON.stringify({ title, nodeId, rootId })
  });
}

export async function deleteBookmark(
  title: string
): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>(`/api/bookmarks/${title}`, {
    method: 'DELETE'
  });
}

export async function getDefaultConfig(): Promise<
  GenerateOptions & { model?: string }
> {
  const raw = await fetchApi<{
    model?: string;
    temperature: number;
    maxTokens: number;
    n: number;
    systemPrompt: string;
  }>('/api/config/defaults');
  return {
    n: raw.n,
    temperature: raw.temperature,
    max_tokens: raw.maxTokens,
    model: raw.model
  };
}

// Note: This helper is no longer needed since the API now returns DisplayMessages directly
// Keeping it for reference but it's unused
export function messagesToDisplayMessages(
  messages: Message[],
  nodeIds: NodeId[]
): DisplayMessage[] {
  return messages.map((message, index) => ({
    ...message,
    nodeId: nodeIds[index] || ('unknown-id' as NodeId)
  }));
}

export async function switchRoot(systemPrompt?: string): Promise<RootData> {
  // Ensure return type is RootData
  return fetchApi<RootData>('/api/roots', {
    method: 'POST',
    body: JSON.stringify({ systemPrompt })
  });
}

export async function listModels(): Promise<string[]> {
  return fetchApi<string[]>('/api/models');
}

export async function listTools(): Promise<ToolInfo[]> {
  return fetchApi<ToolInfo[]>('/api/tools');
}

/**
 * Fetches the complete graph topology for visualization
 * @returns An array of NodeStructure objects representing all nodes in the conversation forest
 */
export async function getGraphTopology(): Promise<NodeStructure[]> {
  return fetchApi<NodeStructure[]>('/api/graph/topology');
}
// Alias for fetching the entire graph topology
export async function getEntireGraph(): Promise<NodeStructure[]> {
  return getGraphTopology();
}

export async function getConfigPresets(): Promise<PresetConfig> {
  const rawConfig = await fetchApi<{
    presets: Config['presets'];
    activePresetName: Config['activePresetName'] | null;
  }>('/api/config/presets');

  const mappedPresets: { [name: string]: PresetDefinition } = {};
  for (const name in rawConfig.presets) {
    const rawPreset = rawConfig.presets[name];
    mappedPresets[name] = {
      n: rawPreset.n,
      temperature: rawPreset.temperature,
      max_tokens: rawPreset.maxTokens // Map here
    };
    Object.keys(mappedPresets[name]).forEach(key => {
      if (mappedPresets[name][key as keyof PresetDefinition] === undefined) {
        delete mappedPresets[name][key as keyof PresetDefinition];
      }
    });
  }

  return {
    presets: mappedPresets,
    activePresetName: rawConfig.activePresetName ?? null
  };
}

export async function setActivePreset(
  presetName: string | null
): Promise<{ activePresetName: string | null }> {
  return fetchApi<{ activePresetName: string | null }>(
    '/api/config/active-preset',
    {
      method: 'PUT',
      body: JSON.stringify({ presetName })
    }
  );
}
