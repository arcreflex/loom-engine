import { create } from 'zustand';
import type { GuiAppState, Status } from './types';
import type { NodeId, Role, NodeData, ProviderName } from '@ankhdt/loom-engine';
import type { DisplayMessage, GenerateOptions } from '../types';
import {
  setState as setAppState,
  getPath,
  getNode,
  getChildren,
  getSiblings,
  appendMessage,
  generateCompletion as apiGenerateCompletion,
  subscribeToGenerationUpdates,
  deleteNode as apiDeleteNode,
  deleteChildren as apiDeleteChildren,
  deleteSiblings as apiDeleteSiblings,
  listBookmarks,
  saveBookmark as apiSaveBookmark,
  deleteBookmark as apiDeleteBookmark,
  switchRoot,
  getConfigPresets,
  getDefaultConfig,
  setActivePreset as apiSetActivePreset,
  getGraphTopology,
  listRoots,
  listTools,
  editNodeContent
} from '../api';
import { ModelSourceInfo } from '../../../engine/src/types';

// Define the initial state
const initialState: Omit<GuiAppState, 'actions'> = {
  // Core Data
  currentNode: null,
  root: null,
  messages: [],
  children: [],
  siblings: [],

  // UI Interaction State
  inputRole: 'user' as Role,
  requestOnSubmit: true,
  previewChild: null,

  // Navigation intent - when set, the UI should navigate
  pendingNavigation: null,

  pendingGeneration: null,

  // Application Status
  status: { type: 'initializing' },

  // Metadata
  bookmarks: [],
  roots: [],

  // Generation Presets
  presets: {},
  activePresetName: null,
  defaultParameters: null,

  // Component State
  paletteState: { status: 'closed' },
  isModelSwitcherOpen: false,
  isMetadataModalOpen: false,

  // Dynamic Model Selection
  currentProviderName: null,
  currentModelName: null,

  // Graph View
  graphViewState: {
    mode: 'single-root',
    previewNodeId: null
  },

  // Rendering Mode
  renderingMode: 'markdown',

  // Tools Management
  tools: {
    available: [],
    groups: [],
    ungroupedTools: [],
    active: []
  }
};

// Create the store
export const useAppStore = create<GuiAppState>((set, get) => ({
  ...initialState,

  actions: {
    // Status management
    setStatus: (status: Status) => set({ status }),

    setStatusLoading: (operation?: string) => {
      const currentStatus = get().status;
      if (currentStatus.type === 'error') return;
      set({ status: { type: 'loading', operation } });
    },

    setStatusIdle: () => {
      const currentStatus = get().status;
      if (currentStatus.type === 'loading' || currentStatus.type === 'error') {
        set({ status: { type: 'idle' } });
      }
    },

    setStatusError: (message: string) => {
      set({ status: { type: 'error', message } });
    },

    // Navigation management
    setPendingNavigation: (nodeId: NodeId | null) =>
      set({ pendingNavigation: nodeId }),
    clearPendingNavigation: () => set({ pendingNavigation: null }),

    // Internal helper functions (do not manage status)
    _loadNodeData: async (nodeId: NodeId) => {
      // Update current node ID in backend state first
      await setAppState(nodeId);

      // Fetch all necessary data in parallel
      const [pathData, fetchedChildren, node] = await Promise.all([
        getPath(nodeId),
        getChildren(nodeId),
        getNode(nodeId)
      ]);

      let fetchedSiblings: NodeData[] = [];
      if (node.parent_id) {
        fetchedSiblings = await getSiblings(nodeId);
      }

      set({
        currentNode: node,
        root: pathData.root,
        messages: pathData.messages,
        children: fetchedChildren,
        siblings: fetchedSiblings,
        previewChild: null // Reset preview on nav
      });

      if (node.pendingGeneration?.status === 'pending') {
        get().actions.subscribeToGeneration(nodeId);
      }

      // Refresh topology in the background
      get().actions.refreshTopology();

      // Initialize model selection based on loaded data
      const { defaultParameters } = get();
      if (defaultParameters) {
        get().actions.initializeModelSelection(pathData.messages);
      }

      let maybeModelNode = node;
      while (
        maybeModelNode?.parent_id &&
        maybeModelNode.metadata.source_info.type !== 'model'
      ) {
        // Traverse up to find the first model node
        maybeModelNode = await getNode(maybeModelNode.parent_id);
      }
      if (
        maybeModelNode?.parent_id &&
        maybeModelNode?.metadata.source_info.type === 'model'
      ) {
        // Set default tool selection
        get().actions.setDefaultToolsFromSourceInfo(
          maybeModelNode.metadata.source_info
        );
      }
    },

    // Core navigation and data loading
    navigateToNode: async (nodeId: NodeId) => {
      const { status, currentNode } = get();
      if (status.type === 'loading' || currentNode?.id === nodeId) return;

      // Clean up any existing generation subscription when navigating away
      get().actions.unsubscribeFromGeneration();

      get().actions.setStatusLoading('Navigating');
      try {
        await get().actions._loadNodeData(nodeId);
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to navigate to node'
        );
      }
    },

    refreshTopology: async () => {
      try {
        await getGraphTopology();
        // Note: The topology is used by components directly via their own API calls
        // This method exists for consistency and future caching opportunities
      } catch (error) {
        console.error('Failed to refresh topology:', error);
      }
    },

    // Data initialization
    fetchInitialData: async () => {
      get().actions.setStatusLoading('Initializing');
      try {
        const [
          roots,
          fetchedBookmarks,
          presetConfig,
          defaults,
          availableTools
        ] = await Promise.all([
          listRoots(),
          listBookmarks(),
          getConfigPresets(),
          getDefaultConfig(),
          listTools()
        ]);

        const groups = new Map<
          string,
          {
            name: string;
            description?: string;
            tools: string[];
          }
        >();

        const ungroupedTools: string[] = [];
        for (const tool of availableTools) {
          if (tool.group) {
            const existingGroup = groups.get(tool.group);
            if (existingGroup) {
              existingGroup.tools.push(tool.name);
            } else {
              groups.set(tool.group, {
                name: tool.group,
                description: tool.description,
                tools: [tool.name]
              });
            }
          } else {
            ungroupedTools.push(tool.name);
          }
        }

        set({
          roots,
          bookmarks: fetchedBookmarks,
          presets: presetConfig.presets,
          activePresetName: presetConfig.activePresetName,
          defaultParameters: defaults,
          tools: {
            available: availableTools,
            groups: Array.from(groups.values()),
            ungroupedTools,
            active: []
          }
        });

        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to initialize'
        );
      }
    },

    // UI state management
    setInputRole: (role: Role) => set({ inputRole: role }),

    toggleRequestOnSubmit: () =>
      set(state => ({
        requestOnSubmit: !state.requestOnSubmit
      })),

    setPreviewChild: (nodeData: NodeData | null) =>
      set({
        previewChild: nodeData
      }),

    // Message and generation actions
    submitInput: async (
      role: Role,
      content: string,
      generateAfter: boolean
    ) => {
      const { currentNode, status } = get();
      if (!currentNode || status.type === 'loading') return;

      const operation = generateAfter ? 'Generating' : 'Saving';
      get().actions.setStatusLoading(operation);
      try {
        let messageNodeId = currentNode.id;
        let newNode: NodeData | undefined;

        // Only append if content is non-empty
        if (content.trim() !== '') {
          newNode = await appendMessage(currentNode.id, role, content);
          messageNodeId = newNode.id;
        }

        if (generateAfter) {
          await get().actions.startGenerationForNode(messageNodeId);
          await get().actions._loadNodeData(messageNodeId);
        }
        set({ pendingNavigation: messageNodeId });

        if (!get().currentNode?.pendingGeneration) {
          get().actions.setStatusIdle();
        }
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error
            ? error.message
            : generateAfter
              ? 'Generation failed'
              : 'Failed to send message'
        );
      }
    },

    handleLargePasteSubmit: async (content: string) => {
      const { currentNode, status, inputRole } = get();
      if (!currentNode || status.type === 'loading') return;

      get().actions.setStatusLoading('Submitting Pasted Content');
      try {
        const newNode = await appendMessage(currentNode.id, inputRole, content);
        set({ pendingNavigation: newNode.id });
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error
            ? error.message
            : 'Failed to handle pasted content'
        );
      }
    },

    // Bookmark management
    saveBookmark: async (title: string) => {
      const { currentNode, status } = get();
      if (!title || status.type === 'loading' || !currentNode) return;

      get().actions.setStatusLoading('Saving Bookmark');
      try {
        const rootId =
          currentNode.parent_id === undefined
            ? currentNode.id
            : currentNode.root_id;
        await apiSaveBookmark(title, currentNode.id, rootId);
        await get().actions.refreshBookmarks();
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to save bookmark'
        );
      }
    },

    deleteBookmark: async (title: string) => {
      const { status } = get();
      if (status.type === 'loading') return;

      get().actions.setStatusLoading('Deleting Bookmark');
      try {
        await apiDeleteBookmark(title);
        await get().actions.refreshBookmarks();
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to delete bookmark'
        );
      }
    },

    refreshBookmarks: async () => {
      try {
        const bookmarks = await listBookmarks();
        set({ bookmarks });
      } catch (error) {
        console.error('Failed to refresh bookmarks:', error);
      }
    },

    // Node management
    deleteNode: async (nodeId: NodeId) => {
      const { status } = get();
      if (status.type === 'loading') return;

      get().actions.setStatusLoading('Deleting Node');
      try {
        const node = (await getNode(nodeId)) as NodeData;
        const parentId = node?.parent_id;

        if (parentId) {
          await apiDeleteNode(nodeId);
          set({ pendingNavigation: parentId });
          get().actions.setStatusIdle();
        } else {
          console.error('Attempted to delete node without parent ID:', nodeId);
          get().actions.setStatusIdle();
        }
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to delete node'
        );
      }
    },

    deleteChildren: async (nodeId: NodeId) => {
      const { status } = get();
      if (status.type === 'loading') return;

      get().actions.setStatusLoading('Deleting Children');
      try {
        await apiDeleteChildren(nodeId);
        await get().actions._loadNodeData(nodeId);
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to delete children'
        );
      }
    },

    deleteSiblings: async (nodeId: NodeId) => {
      const { status } = get();
      if (status.type === 'loading') return;

      get().actions.setStatusLoading('Deleting Siblings');
      try {
        await apiDeleteSiblings(nodeId);
        await get().actions._loadNodeData(nodeId);
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to delete siblings'
        );
      }
    },

    // Editing
    handleEditSave: async (nodeId: NodeId, newContent: string) => {
      const { status } = get();
      if (status.type === 'loading') return;

      get().actions.setStatusLoading('Saving Edit');
      try {
        const newNode = await editNodeContent(nodeId, newContent);
        set({ pendingNavigation: newNode.id });
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to save edit'
        );
      }
    },

    handleSystemPromptSave: async (newPrompt: string) => {
      await get().actions.createNewRoot(newPrompt);
    },

    // Model and preset management
    setCurrentModel: (providerName: ProviderName, modelName: string) => {
      set({
        currentProviderName: providerName,
        currentModelName: modelName
      });
    },

    setActivePreset: async (name: string | null) => {
      get().actions.setStatusLoading('Setting Preset');
      try {
        await apiSetActivePreset(name);
        set({ activePresetName: name });
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to set preset'
        );
      }
    },

    // Command palette
    openPalette: () =>
      set({
        paletteState: { status: 'open', query: '', selectedIndex: 0 }
      }),

    closePalette: () =>
      set({
        paletteState: { status: 'closed' }
      }),

    updatePaletteQuery: (query: string) => {
      const { paletteState } = get();
      if (paletteState.status === 'open') {
        set({
          paletteState: { ...paletteState, query, selectedIndex: 0 }
        });
      }
    },

    setPaletteSelectedIndex: (index: number) => {
      const { paletteState } = get();
      if (paletteState.status === 'open') {
        set({
          paletteState: { ...paletteState, selectedIndex: index }
        });
      }
    },

    // Modal management
    openModelSwitcher: () => set({ isModelSwitcherOpen: true }),
    closeModelSwitcher: () => set({ isModelSwitcherOpen: false }),
    openMetadataModal: () => set({ isMetadataModalOpen: true }),
    closeMetadataModal: () => set({ isMetadataModalOpen: false }),

    // Graph view
    setGraphViewMode: mode =>
      set(state => ({
        graphViewState: { ...state.graphViewState, mode }
      })),

    setGraphHoverPreview: (nodeId, messages, root) => {
      if (nodeId === null) {
        set(state => ({
          graphViewState: {
            mode: state.graphViewState.mode,
            previewNodeId: null
          }
        }));
      } else if (messages && root) {
        set(state => ({
          graphViewState: {
            mode: state.graphViewState.mode,
            previewNodeId: nodeId,
            previewMessages: messages,
            previewRoot: root
          }
        }));
      }
    },

    // Rendering mode
    toggleRenderingMode: () =>
      set(state => ({
        renderingMode: state.renderingMode === 'markdown' ? 'raw' : 'markdown'
      })),

    // Tool management
    toggleTool: (toolName: string) => {
      set(state => {
        const active = state.tools.active;
        const newActive = active.includes(toolName)
          ? active.filter(name => name !== toolName)
          : [...active, toolName];
        return {
          tools: { ...state.tools, active: newActive }
        };
      });
    },

    toggleToolGroup: (groupName: string) => {
      set(state => {
        const group = state.tools.groups.find(g => g.name === groupName);
        if (!group) return state;

        const groupTools = group.tools;
        const active = state.tools.active;
        const allGroupToolsActive = groupTools.every(tool =>
          active.includes(tool)
        );

        let newActive: string[];
        if (allGroupToolsActive) {
          // Deactivate all tools in the group
          newActive = active.filter(tool => !groupTools.includes(tool));
        } else {
          // Activate all tools in the group
          newActive = [...new Set([...active, ...groupTools])];
        }

        return {
          tools: { ...state.tools, active: newActive }
        };
      });
    },

    setActiveTools: (toolNames: string[]) => {
      set(state => ({
        tools: { ...state.tools, active: toolNames }
      }));
    },

    // Root/conversation management
    createNewRoot: async (systemPrompt?: string) => {
      const { status } = get();
      if (status.type === 'loading') return;

      get().actions.setStatusLoading('Creating New Conversation');
      try {
        const newRoot = await switchRoot(systemPrompt);
        set({ pendingNavigation: newRoot.id });
        get().actions.closeModelSwitcher();
        get().actions.setStatusIdle();
      } catch (error) {
        get().actions.closeModelSwitcher();
        get().actions.setStatusError(
          error instanceof Error
            ? error.message
            : 'Failed to create new conversation'
        );
      }
    },

    navigateToParent: async () => {
      const { currentNode, status } = get();
      if (!currentNode || status.type === 'loading') return;

      get().actions.setStatusLoading('Navigating Parent');
      try {
        if (currentNode.parent_id) {
          set({ pendingNavigation: currentNode.parent_id });
          get().actions.setStatusIdle();
        } else {
          get().actions.setStatusIdle();
        }
      } catch (error) {
        get().actions.setStatusError(
          error instanceof Error ? error.message : 'Failed to navigate parent'
        );
      }
    },

    startGenerationForNode: async (
      parentNodeId: NodeId,
      options?: Partial<GenerateOptions>
    ) => {
      const {
        currentProviderName,
        currentModelName,
        defaultParameters,
        presets,
        activePresetName,
        tools
      } = get();

      if (!currentProviderName || !currentModelName) {
        throw new Error('No model selected. Please select a model first.');
      }

      let effectiveParams = defaultParameters || {};
      if (activePresetName && presets[activePresetName]) {
        effectiveParams = {
          ...effectiveParams,
          ...presets[activePresetName]
        };
      }

      const finalParams: GenerateOptions = {
        n: 1,
        temperature: 1.0,
        max_tokens: 1024,
        ...effectiveParams,
        ...(options || {})
      };

      await apiGenerateCompletion(
        parentNodeId,
        currentProviderName,
        currentModelName,
        finalParams,
        tools.active
      );
    },

    subscribeToGeneration: (nodeId: NodeId) => {
      get().actions.unsubscribeFromGeneration();

      const eventSource = subscribeToGenerationUpdates(nodeId, state => {
        if (state.added) {
          set({ children: get().children.concat(state.added) });
        }

        if (state.error) {
          get().actions.setStatusError(state.error);
        }

        if (state.status === 'idle') {
          get().actions.setStatusIdle();
          get().actions.unsubscribeFromGeneration();
          if (state.added?.length === 1) {
            // Auto-navigate if single child and we're currently on the parent
            set({ pendingNavigation: state.added[0].id });
          } else {
            get().actions._loadNodeData(nodeId);
          }
        } else if (state.status === 'error') {
          // Handle error state
          get().actions.setStatusError(state.error || 'Generation failed');
          get().actions.unsubscribeFromGeneration();
        }
      });

      set({
        pendingGeneration: {
          nodeId,
          subscription: eventSource,
          startedAt: new Date()
        }
      });
    },

    unsubscribeFromGeneration: () => {
      const { pendingGeneration } = get();
      if (pendingGeneration?.subscription) {
        pendingGeneration.subscription.close();
        set({ pendingGeneration: null });
      }
    },

    // Helper methods (internal)
    initializeModelSelection: (messages: DisplayMessage[]) => {
      const { currentProviderName, currentModelName } = get();

      // If we already have a current model selected, don't change it
      if (currentProviderName && currentModelName) {
        return;
      }

      // Try to find model info from the most recent assistant message
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (
          message.role === 'assistant' &&
          message.sourceProvider &&
          message.sourceModelName
        ) {
          get().actions.setCurrentModel(
            message.sourceProvider,
            message.sourceModelName
          );
          return;
        }
      }
    },

    setDefaultToolsFromSourceInfo: (sourceInfo: ModelSourceInfo) => {
      const { tools } = get();
      if (sourceInfo.tools && sourceInfo.tools.length > 0) {
        // Extract tool names from the source info
        const toolNames = sourceInfo.tools.map(tool => tool.function.name);

        // Filter to only include tools that are currently available
        const availableToolNames = tools.available.map(tool => tool.name);
        const validToolNames = toolNames.filter(name =>
          availableToolNames.includes(name)
        );

        // Only update if there are valid tools to set
        if (validToolNames.length > 0) {
          get().actions.setActiveTools(validToolNames);
        }
      } else {
        // For root nodes, non-model nodes, or nodes without tools, clear active tools
        get().actions.setActiveTools([]);
      }
    }
  }
}));
