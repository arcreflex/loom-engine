import { describe, it, beforeEach, mock, afterEach } from 'node:test';
import type {
  Message,
  Node,
  NodeData,
  NodeId,
  RootConfig,
  RootData,
  RootId,
  SourceInfo
} from './types.ts';
import type { ILoomStore, NodeQueryCriteria } from './store/types.ts';
import type { IProvider } from './providers/types.ts';
import { OpenAIProvider } from './providers/openai.ts';
import type { Forest } from './forest.ts';

export const mockNodeId = (id: string): NodeId => id as NodeId;
export const mockRootId = (id: string): RootId => id as RootId;

export function createMockStore() {
  const nodes: Map<string, NodeData> = new Map();
  const roots: Map<string, RootData> = new Map();

  const mockStore = {
    initialize: mock.fn(async () => {}),

    saveNode: mock.fn(async (nodeData: Node) => {
      if (nodeData.parent_id === undefined) {
        return mockStore.saveRootInfo(nodeData);
      }
      nodes.set(nodeData.id, { ...nodeData });
    }),

    loadNode: mock.fn(async (nodeId: NodeId) => {
      const node = nodes.get(nodeId) ?? roots.get(nodeId);
      return node ? { ...node } : null;
    }),

    deleteNode: mock.fn(async (nodeId: NodeId) => {
      nodes.delete(nodeId);
    }),

    findNodes: mock.fn(async (criteria: NodeQueryCriteria) => {
      return Array.from(nodes.values())
        .filter(node => {
          if (criteria.rootId && node.root_id !== criteria.rootId) return false;
          if (criteria.parentId && node.parent_id !== criteria.parentId)
            return false;
          return true;
        })
        .map(node => ({ ...node }));
    }),

    saveRootInfo: mock.fn(async (rootInfo: RootData) => {
      roots.set(rootInfo.id, { ...rootInfo });
    }),

    loadRootInfo: mock.fn(async (rootId: RootId) => {
      const root = roots.get(rootId);
      return root ? { ...root } : null;
    }),

    listRootInfos: mock.fn(async () => {
      return Array.from(roots.values()).map(root => ({ ...root }));
    }),

    log: console.log.bind(console)
  };

  mockStore satisfies ILoomStore;

  return {
    mockStore,
    nodes,
    roots,
    // Helper methods for testing
    createTestNode: (
      id: string,
      rootId: string,
      parentId: string | null,
      message: Message,
      source: SourceInfo = { type: 'user' }
    ): NodeData => {
      const nodeId = mockNodeId(id);
      const rId = mockRootId(rootId);
      const timestamp = new Date().toISOString();

      const node: NodeData = {
        id: nodeId,
        root_id: rId,
        parent_id: parentId ? mockNodeId(parentId) : rId,
        child_ids: [],
        message,
        metadata: {
          timestamp,
          original_root_id: rId,
          source_info: source
        }
      };

      nodes.set(id, node);
      return node;
    },
    createTestRoot: (
      id: string,
      config: RootConfig = {
        model: 'claude-3-opus',
        providerType: 'anthropic'
      }
    ): RootData => {
      const rootId = mockRootId(id);
      const root: RootData = {
        id: rootId,
        createdAt: new Date().toISOString(),
        config,
        child_ids: []
      };

      roots.set(id, root);
      return root;
    }
  };
}

export const mockProviders = () => {
  const mockProviderInstance = {
    generate: mock.fn<IProvider['generate']>()
  };
  mock.method(
    OpenAIProvider.prototype,
    'generate',
    mockProviderInstance.generate
  );
  return mockProviderInstance;
};
