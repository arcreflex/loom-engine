import { mock } from 'node:test';
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

export const mockNodeId = (id: string): NodeId => id as NodeId;
export const mockRootId = (id: string): RootId => id as RootId;

export function createMockStore() {
  const nodes: Map<string, NodeData> = new Map();
  const roots: Map<string, RootData> = new Map();

  const mockStore = {
    initialize: mock.fn(async () => {}),

    generateNodeId: (root: RootId) => {
      return `node-${root}-${Math.random().toString(36).substring(2, 15)}` as NodeId;
    },
    generateRootId: () => {
      return `root-${Math.random().toString(36).substring(2, 15)}` as RootId;
    },

    saveNode: mock.fn(async (nodeData: Node) => {
      if (nodeData.parent_id === undefined) {
        return mockStore.saveRootInfo(nodeData);
      }
      nodes.set(nodeData.id, { ...nodeData });
    }),

    loadNode: mock.fn(async (nodeId: NodeId) => {
      const node = roots.get(nodeId) ?? nodes.get(nodeId);
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

    listAllNodeStructures: mock.fn(async () => {
      // Convert roots to NodeStructure objects
      const rootStructures = Array.from(roots.values()).map(root => ({
        id: root.id,
        parent_id: null,
        child_ids: root.child_ids,
        root_id: root.id,
        timestamp: root.createdAt,
        role: 'system' as const
      }));

      // Convert nodes to NodeStructure objects
      const nodeStructures = Array.from(nodes.values()).map(node => ({
        id: node.id,
        parent_id: node.parent_id,
        child_ids: node.child_ids,
        root_id: node.root_id,
        timestamp: node.metadata.timestamp,
        role: node.message.role
      }));

      return [...rootStructures, ...nodeStructures];
    }),

    log: console.log.bind(console),

    // V2 normalized methods - not implemented in mock
    loadNodeNormalized: mock.fn(async (_nodeId: NodeId) => {
      throw new Error('loadNodeNormalized not implemented in mock store');
    }),

    findNodesNormalized: mock.fn(async (_criteria: NodeQueryCriteria) => {
      throw new Error('findNodesNormalized not implemented in mock store');
    })
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
        systemPrompt: 'You are a helpful assistant'
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
