import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import {
  Routes,
  Route,
  useParams,
  useNavigate,
  Navigate
} from 'react-router-dom';
import {
  setState as setAppState,
  getPath,
  getNode,
  getChildren,
  getSiblings,
  appendMessage,
  generateCompletion as apiGenerateCompletion,
  deleteNode as apiDeleteNode,
  deleteChildren as apiDeleteChildren,
  deleteSiblings as apiDeleteSiblings,
  listBookmarks,
  saveBookmark as apiSaveBookmark,
  deleteBookmark as apiDeleteBookmark,
  switchRoot,
  getConfigPresets,
  getDefaultConfig,
  setActivePreset,
  getGraphTopology,
  NodeStructure,
  listRoots,
  listTools,
  listToolGroups,
  editNodeContent
} from './api';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { StatusBar } from './components/StatusBar';
import { ContextView } from './components/ContextView';
import { GraphView } from './components/GraphView';
import { InputArea } from './components/InputArea';
import { CommandPalette } from './components/CommandPalette';
import { ModelSwitcherModal } from './components/ModelSwitcherModal.tsx';
import HomeView from './components/HomeView';
import type { Command, DisplayMessage, GenerateOptions } from './types';
import type { NodeData, NodeId, Role, Node } from '@ankhdt/loom-engine';
import { parseModelString, KNOWN_MODELS } from '@ankhdt/loom-engine/browser';
import { ChildNavigator } from './components/ChildNavigator';
import { ToolsPanel } from './components/ToolsPanel';

// Import the new state management components
import { AppProvider, useAppContext } from './state';

// App Internal Component (uses context)
function AppContent() {
  // Get URL parameter
  const { nodeId: nodeIdFromUrl } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();

  // Get state and dispatch from context
  const { state, dispatch } = useAppContext();
  const {
    currentNode,
    root,
    messages,
    children,
    siblings,
    inputRole,
    requestOnSubmit,
    previewChild,
    status,
    bookmarks,
    paletteState,
    isModelSwitcherOpen,
    presets,
    activePresetName,
    defaultParameters,
    currentProviderName,
    currentModelName,
    tools
  } = state;

  const currentRootId =
    currentNode?.parent_id === undefined
      ? currentNode?.id
      : currentNode?.root_id;

  // State for graph topology data
  const [graphTopology, setGraphTopology] = useState<NodeStructure[]>([]);

  const isInitializedRef = useRef(false);

  // Helper function to initialize model selection based on context
  const initializeModelSelection = useCallback(
    (messages: DisplayMessage[]) => {
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
          dispatch({
            type: 'SET_CURRENT_GENERATION_MODEL',
            payload: {
              providerName: message.sourceProvider,
              modelName: message.sourceModelName
            }
          });
          return;
        }
      }
    },
    [dispatch, currentProviderName, currentModelName]
  );

  // Helper function to set default tools based on node's source info
  const setDefaultToolsFromSourceInfo = useCallback(
    (node: Node) => {
      // Only handle NodeData (not RootData) and only model nodes with tool information
      if (
        'metadata' in node &&
        node.metadata.source_info.type === 'model' &&
        node.metadata.source_info.tools &&
        node.metadata.source_info.tools.length > 0
      ) {
        // Extract tool names from the source info
        const toolNames = node.metadata.source_info.tools.map(
          tool => tool.function.name
        );

        // Filter to only include tools that are currently available
        const availableToolNames = tools.available.map(tool => tool.name);
        const validToolNames = toolNames.filter(name =>
          availableToolNames.includes(name)
        );

        // Only update if there are valid tools to set
        if (validToolNames.length > 0) {
          dispatch({
            type: 'SET_TOOLS_ACTIVE',
            payload: { toolNames: validToolNames }
          });
        }
      } else {
        // For root nodes, non-model nodes, or nodes without tools, clear active tools
        dispatch({
          type: 'SET_TOOLS_ACTIVE',
          payload: { toolNames: [] }
        });
      }
    },
    [dispatch, tools.available]
  );

  // Find the current bookmark for this node
  const currentBookmark = currentNode?.id
    ? bookmarks.find(b => b.nodeId === currentNode?.id) || null
    : null;

  // --- Async Action Helpers ---
  // These functions handle API calls and dispatch appropriate actions

  // --- Fetch graph topology ---
  const fetchTopology = useCallback(async () => {
    try {
      const topologyData = await getGraphTopology();
      setGraphTopology(topologyData);
    } catch (error) {
      console.error('Failed to fetch graph topology:', error);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  const loadNodeData = useCallback(
    async (nodeId: NodeId) => {
      // Update current node ID in backend state first
      await setAppState(nodeId);

      // Fetch all necessary data in parallel (or sequentially if needed)
      const [pathData, fetchedChildren, node] = await Promise.all([
        getPath(nodeId),
        getChildren(nodeId),
        getNode(nodeId) // Needed for parent_id to fetch siblings
      ]);

      let fetchedSiblings: NodeData[] = [];
      if (node.parent_id) {
        fetchedSiblings = await getSiblings(nodeId);
      }

      await fetchTopology();

      dispatch({
        type: 'LOAD_NODE_DATA_SUCCESS',
        payload: {
          node,
          root: pathData.root,
          messages: pathData.messages,
          children: fetchedChildren,
          siblings: fetchedSiblings
        }
      });

      // Initialize model selection based on loaded data
      if (defaultParameters) {
        initializeModelSelection(pathData.messages);
      }

      // Set default tool selection based on the current node's source info
      setDefaultToolsFromSourceInfo(node);
    },
    [
      dispatch,
      fetchTopology,
      initializeModelSelection,
      defaultParameters,
      setDefaultToolsFromSourceInfo
    ]
  );

  const loadNodeDataWithStatusUpdates = useCallback(
    async (nodeId: NodeId) => {
      if (!nodeId) return; // Should not happen if called correctly
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Navigating' }
      });
      try {
        await loadNodeData(nodeId);
        dispatch({ type: 'SET_STATUS_IDLE' });
      } catch (error) {
        console.error('Failed to load node data:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to load node data'
          }
        });
      }
    },
    [dispatch, loadNodeData]
  );

  const previewNode = useCallback(
    async (nodeId: NodeId | null) => {
      if (nodeId === state.graphViewState.previewNodeId) return;
      if (nodeId === null) {
        dispatch({
          type: 'SET_GRAPH_HOVER_PREVIEW',
          payload: { nodeId: null }
        });
        return;
      }
      const path = await getPath(nodeId);
      const messages = path.messages;
      const root = path.root;
      dispatch({
        type: 'SET_GRAPH_HOVER_PREVIEW',
        payload: { nodeId, messages, root }
      });
    },
    [dispatch, state.graphViewState.previewNodeId]
  );

  const initializeApp = useCallback(async () => {
    // Prevent double initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    dispatch({
      type: 'SET_STATUS_LOADING',
      payload: { operation: 'Initializing' }
    });
    try {
      const [
        roots,
        fetchedBookmarks,
        presetConfig,
        defaults,
        availableTools,
        toolGroups
      ] = await Promise.all([
        listRoots(),
        listBookmarks(),
        getConfigPresets(), // Fetch presets
        getDefaultConfig(), // Fetch defaults
        listTools(), // Fetch available tools
        listToolGroups() // Fetch tool groups
      ]);

      // Set preset config and defaults first
      dispatch({
        type: 'SET_PRESET_CONFIG',
        payload: {
          presets: presetConfig.presets,
          activePresetName: presetConfig.activePresetName
        }
      });

      dispatch({
        type: 'SET_DEFAULT_PARAMETERS',
        payload: {
          parameters: defaults
        }
      });

      // Set bookmarks
      dispatch({
        type: 'SET_BOOKMARKS',
        payload: { bookmarks: fetchedBookmarks }
      });

      // Set roots
      dispatch({
        type: 'SET_ROOTS',
        payload: { roots }
      });

      // Set available tools
      dispatch({
        type: 'SET_AVAILABLE_TOOLS',
        payload: { tools: availableTools }
      });

      // Set tool groups
      dispatch({
        type: 'SET_TOOL_GROUPS',
        payload: {
          groups: toolGroups.groups,
          ungroupedTools: toolGroups.ungroupedTools
        }
      });

      // Set status to idle after loading config/bookmarks
      dispatch({ type: 'SET_STATUS_IDLE' });
    } catch (error) {
      console.error('Failed to initialize:', error);
      dispatch({
        type: 'SET_STATUS_ERROR',
        payload: {
          message:
            error instanceof Error ? error.message : 'Failed to initialize'
        }
      });
    }
  }, [dispatch]); // Remove loadNodeDataWithStatusUpdates dependency

  // --- Fetch initial state ---
  useEffect(() => {
    initializeApp();
  }, [initializeApp]); // Run only once on mount

  // --- Handle URL changes ---
  useEffect(() => {
    if (nodeIdFromUrl) {
      // Check if the URL node is different from the current state node
      if (nodeIdFromUrl !== state.currentNode?.id) {
        console.log(`URL changed to: ${nodeIdFromUrl}, loading data...`);
        loadNodeDataWithStatusUpdates(nodeIdFromUrl as NodeId);
      }
    } else {
      // Handle case where URL might not have nodeId (though route protects this)
      // Optional: Could dispatch an action to clear node state if needed,
      // but the routing setup should handle this by rendering HomePage.
      console.log('No nodeId in URL for AppContent route.');
    }
  }, [nodeIdFromUrl, loadNodeDataWithStatusUpdates, state.currentNode]);

  // Refresh topology when currentNodeId changes
  useEffect(() => {
    if (currentNode?.id) {
      fetchTopology();
    }
  }, [currentNode, fetchTopology]);

  // --- Navigation Actions ---
  const navigateToNode = useCallback(
    (nodeId: NodeId) => {
      if (nodeId === nodeIdFromUrl) return; // Avoid navigating to the same URL
      console.log(`Navigating to node: ${nodeId}`);
      navigate(`/nodes/${encodeURIComponent(nodeId)}`);
    },
    [navigate, nodeIdFromUrl]
  );

  const navigateToParent = useCallback(async () => {
    if (!currentNode || status.type === 'loading') return;

    dispatch({
      type: 'SET_STATUS_LOADING',
      payload: { operation: 'Navigating Parent' }
    });
    try {
      if (currentNode.parent_id) {
        const parentId = currentNode.parent_id;
        console.log(`Navigating to parent: ${parentId}`);
        navigateToNode(parentId);
      } else {
        dispatch({ type: 'SET_STATUS_IDLE' }); // No parent, just go back to idle
      }
    } catch (error) {
      console.error('Failed to navigate to parent:', error);
      dispatch({
        type: 'SET_STATUS_ERROR',
        payload: {
          message:
            error instanceof Error ? error.message : 'Failed to navigate parent'
        }
      });
    }
  }, [currentNode, navigateToNode, dispatch, status.type]);

  // --- Generation & Message Sending ---
  // Calculate effective generation parameters based on active preset
  const effectiveGenerationParams = useMemo((): GenerateOptions | null => {
    if (!defaultParameters) {
      return null; // Not loaded yet
    }
    if (activePresetName && presets[activePresetName]) {
      // Merge active preset over defaults
      return {
        ...defaultParameters, // Start with defaults
        ...presets[activePresetName] // Override with preset values
      };
    }
    // No active preset or preset not found, use defaults
    return defaultParameters;
  }, [presets, activePresetName, defaultParameters]);

  const handleGenerate = useCallback(
    async (
      nodeIdToGenerateFrom: NodeId,
      options?: Partial<GenerateOptions>
    ) => {
      if (status.type === 'loading') return;

      if (!currentProviderName || !currentModelName) {
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message: 'No model selected. Please select a model first.'
          }
        });
        return;
      }

      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Generating' }
      });
      try {
        const finalParams: Partial<GenerateOptions> = {
          ...(effectiveGenerationParams || {}), // Use calculated params as base (or empty if null)
          ...(options || {}) // Override with any specific options passed to handleGenerate
        };

        // Ensure required fields have fallbacks if somehow still missing
        finalParams.n = finalParams.n ?? 1;
        finalParams.temperature = finalParams.temperature ?? 1.0;
        finalParams.max_tokens = finalParams.max_tokens ?? 1024;

        const results = await apiGenerateCompletion(
          nodeIdToGenerateFrom,
          currentProviderName,
          currentModelName,
          finalParams as GenerateOptions,
          tools.active // Pass active tools
        );

        if (results.length === 1) {
          console.log(`Navigating after generation: ${results[0].id}`);
          navigateToNode(results[0].id);
        } else if (results.length > 1) {
          navigateToNode(nodeIdToGenerateFrom);
          // Handle multiple results (e.g., show a list to choose from)
          console.log(
            `Multiple results found: ${results.map(r => r.id).join(', ')}`
          );
          // No need to reload the current node when new children are added
          // Let the graph view update handle this or user can refresh manually
          dispatch({ type: 'SET_STATUS_IDLE' });
        } else {
          // No results, just go back to idle
          dispatch({ type: 'SET_STATUS_IDLE' });
        }
      } catch (error) {
        console.error('Failed to generate completion:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error ? error.message : 'Generation failed'
          }
        });
      }
    },
    [
      status.type,
      dispatch,
      effectiveGenerationParams,
      navigateToNode,
      currentProviderName,
      currentModelName,
      tools.active
    ]
  );

  const handleSendMessage = useCallback(
    async (role: Role, content: string, generateAfter: boolean) => {
      if (!currentNode || status.type === 'loading') return;

      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Sending' }
      });
      try {
        let messageNodeId = currentNode.id;
        let newNode: NodeData | undefined;
        // Only append if content is non-empty
        if (content.trim() !== '') {
          newNode = await appendMessage(currentNode.id, role, content);
          messageNodeId = newNode.id;
        }

        if (generateAfter) {
          if (newNode) {
            // preview the node we just sent.
            dispatch({
              type: 'SET_PREVIEW_CHILD',
              payload: { nodeData: newNode }
            });
          }

          await handleGenerate(messageNodeId);
        } else {
          navigateToNode(messageNodeId);
        }
      } catch (error) {
        console.error('Failed to send message:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error ? error.message : 'Failed to send message'
          }
        });
      }
    },
    [currentNode, dispatch, navigateToNode, handleGenerate, status.type]
  );

  const handleLargePasteSubmit = useCallback(
    async (content: string) => {
      if (!currentNode || status.type === 'loading') return;

      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Submitting Pasted Content' }
      });

      try {
        const newNode = await appendMessage(currentNode.id, inputRole, content);
        console.log(`Navigating after paste: ${newNode.id}`);
        navigateToNode(newNode.id);
      } catch (error) {
        console.error('Failed to handle large paste:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to handle pasted content'
          }
        });
      }
    },
    [currentNode, dispatch, navigateToNode, status.type, inputRole]
  );

  // --- Bookmark Actions ---
  const fetchBookmarksAndUpdateState = useCallback(async () => {
    try {
      const updatedBookmarks = await listBookmarks();
      dispatch({
        type: 'SET_BOOKMARKS',
        payload: { bookmarks: updatedBookmarks }
      });
    } catch (error) {
      console.error('Failed to fetch bookmarks', error);
      // Optionally dispatch an error, but maybe less critical here
    }
  }, [dispatch]);

  // --- Tool Management ---
  const handleToggleTool = useCallback(
    (toolName: string) => {
      dispatch({
        type: 'TOGGLE_TOOL_ACTIVE',
        payload: { toolName }
      });
    },
    [dispatch]
  );

  const handleToggleToolGroup = useCallback(
    (groupName: string) => {
      dispatch({
        type: 'TOGGLE_TOOL_GROUP_ACTIVE',
        payload: { groupName }
      });
    },
    [dispatch]
  );

  const saveBookmark = useCallback(
    async (title: string) => {
      if (!title || status.type === 'loading') return;
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Saving Bookmark' }
      });
      try {
        if (!state.currentNode) {
          throw new Error('Cannot save bookmark: No current node ID in URL.');
        }
        const rootId =
          state.currentNode.parent_id === undefined
            ? state.currentNode.id
            : state.currentNode.root_id;
        await apiSaveBookmark(title, state.currentNode.id, rootId);
        await fetchBookmarksAndUpdateState(); // Refresh bookmarks
        dispatch({ type: 'SET_STATUS_IDLE' });
      } catch (error) {
        console.error('Failed to save bookmark:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error ? error.message : 'Failed to save bookmark'
          }
        });
      }
    },
    [dispatch, fetchBookmarksAndUpdateState, state.currentNode, status.type]
  );

  const deleteBookmark = useCallback(
    async (title: string) => {
      if (status.type === 'loading') return;
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Deleting Bookmark' }
      });
      try {
        await apiDeleteBookmark(title);
        await fetchBookmarksAndUpdateState(); // Refresh bookmarks
        dispatch({ type: 'SET_STATUS_IDLE' });
      } catch (error) {
        console.error('Failed to delete bookmark:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to delete bookmark'
          }
        });
      }
    },
    [dispatch, fetchBookmarksAndUpdateState, status.type]
  );

  // --- New Conversation Creation ---
  const handleCreateNewRoot = useCallback(
    async (systemPrompt?: string) => {
      // We don't need to set loading state here, modal handles its own.
      // The navigateToNode call below will set the app loading state.
      try {
        const newRoot = await switchRoot(systemPrompt);
        // Close modal implicitly via successful state update triggering navigation
        console.log(`Navigating after new root creation: ${newRoot.id}`);
        navigateToNode(newRoot.id);
        // Dispatch close *after* navigation is initiated to avoid UI flicker
        dispatch({ type: 'CLOSE_MODEL_SWITCHER' });
      } catch (error) {
        console.error('Failed to create new root:', error);
        // Error is displayed within the modal, but we might want a global error too?
        // For now, the modal shows the error. Re-throw to potentially let modal handle it.
        dispatch({ type: 'CLOSE_MODEL_SWITCHER' }); // Close modal even on failure
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to create new conversation'
          }
        });
        // Re-throwing allows the modal's catch block to potentially handle UI feedback
        // throw error; // Decided against re-throwing, let modal handle its error display. App state reflects main error.
      }
    },
    [dispatch, navigateToNode]
  ); // Updated to use navigateToNode instead

  // Handle setting active preset
  const handleSetActivePreset = useCallback(
    async (name: string | null) => {
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Setting Preset' }
      });
      try {
        await setActivePreset(name);
        dispatch({ type: 'SET_ACTIVE_PRESET_NAME', payload: { name } });
        dispatch({ type: 'SET_STATUS_IDLE' });
      } catch (error) {
        console.error('Failed to set active preset:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error ? error.message : 'Failed to set preset'
          }
        });
      }
    },
    [dispatch]
  );

  // --- Message and System Prompt Editing ---
  const handleEditSave = useCallback(
    async (nodeId: NodeId, newContent: string) => {
      if (status.type === 'loading') return;
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Saving Edit' }
      });
      try {
        const newNode = await editNodeContent(nodeId, newContent);
        navigateToNode(newNode.id); // This will update state and set status to idle
      } catch (error) {
        console.error('Failed to save edit:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error ? error.message : 'Failed to save edit'
          }
        });
      }
    },
    [dispatch, navigateToNode, status.type]
  );

  const handleSystemPromptSave = useCallback(
    async (newPrompt: string) => {
      // Reuses the "new conversation" logic, which is what we want
      // when editing the prompt of a conversation that already has messages.
      await handleCreateNewRoot(newPrompt);
    },
    [handleCreateNewRoot]
  );

  // --- Node Deletion Actions ---
  const deleteNode = useCallback(
    async (nodeId: NodeId) => {
      if (status.type === 'loading') return;
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Deleting Node' }
      });
      try {
        // Get parent *before* deleting to navigate after
        const node = (await getNode(nodeId)) as NodeData;
        const parentId = node?.parent_id;

        if (parentId) {
          await apiDeleteNode(nodeId);
          // Navigate to parent after deletion is successful
          console.log(`Navigating after delete: ${parentId}`);
          navigateToNode(parentId);
        } else {
          // Should not happen for non-root nodes, but handle defensively
          console.error('Attempted to delete node without parent ID:', nodeId);
          dispatch({ type: 'SET_STATUS_IDLE' });
        }
      } catch (error) {
        console.error('Failed to delete node:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error ? error.message : 'Failed to delete node'
          }
        });
      }
    },
    [dispatch, navigateToNode, status.type]
  );

  const deleteChildren = useCallback(
    async (nodeId: NodeId) => {
      if (status.type === 'loading') return;
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Deleting Children' }
      });
      try {
        await apiDeleteChildren(nodeId);
        // Reload current node to reflect deleted children
        await loadNodeDataWithStatusUpdates(nodeId); // This sets status idle
      } catch (error) {
        console.error('Failed to delete children:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to delete children'
          }
        });
      }
    },
    [dispatch, loadNodeDataWithStatusUpdates, status.type]
  );

  const deleteSiblings = useCallback(
    async (nodeId: NodeId) => {
      if (status.type === 'loading') return;
      dispatch({
        type: 'SET_STATUS_LOADING',
        payload: { operation: 'Deleting Siblings' }
      });
      try {
        await apiDeleteSiblings(nodeId);
        // Reload current node to reflect deleted siblings
        await loadNodeDataWithStatusUpdates(nodeId); // This sets status idle
      } catch (error) {
        console.error('Failed to delete siblings:', error);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to delete siblings'
          }
        });
      }
    },
    [dispatch, loadNodeDataWithStatusUpdates, status.type]
  );

  // Clipboard Helper Function
  const copyToClipboard = useCallback(
    async (text: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(text);
        // Optional: Display a success message (currently just logging)
        console.log(successMessage);
      } catch (err) {
        console.error('Failed to copy text: ', err);
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: {
            message: 'Failed to copy to clipboard'
          }
        });
      }
    },
    [dispatch]
  );

  // --- Command Palette ---
  const handleExecuteCommand = useCallback(
    async (command: Command) => {
      dispatch({ type: 'PALETTE_CLOSE' }); // Close palette immediately
      // Execute command might trigger loading states internally
      try {
        await command.execute();
      } catch (error) {
        console.error('Failed to execute command:', command.id, error);
        // Ensure error state is set if command execution fails without setting it
        if (status.type !== 'error') {
          dispatch({
            type: 'SET_STATUS_ERROR',
            payload: {
              message:
                error instanceof Error
                  ? error.message
                  : `Command ${command.id} failed`
            }
          });
        }
      }
    },
    [dispatch, status.type]
  ); // Add status.type dependency

  // Build list of available commands (now uses state and helpers/dispatch)
  const commands = useCallback((): Command[] => {
    // Using messages is why it was added to the dependency array
    const cmds: Command[] = [
      {
        id: 'set-role-user',
        title: 'Set Input Role: User',
        execute: async () =>
          dispatch({ type: 'SET_INPUT_ROLE', payload: { role: 'user' } })
      },
      {
        id: 'set-role-assistant',
        title: 'Set Input Role: Assistant',
        execute: async () =>
          dispatch({ type: 'SET_INPUT_ROLE', payload: { role: 'assistant' } })
      },
      {
        id: 'toggle-generate-submit',
        title: `Toggle Generate on Submit (${requestOnSubmit ? 'ON' : 'OFF'})`,
        execute: async () => dispatch({ type: 'TOGGLE_REQUEST_ON_SUBMIT' })
      },
      {
        id: 'navigate-parent',
        title: 'Navigate to Parent',
        disabled: !currentNode?.parent_id || !root || !messages.length, // Disable if at root
        execute: navigateToParent // Use the helper
      },
      {
        id: 'generate',
        title: 'Generate Completion',
        disabled: !currentNode || status.type === 'loading',
        execute: async () => {
          if (!currentNode) return;
          await handleGenerate(currentNode.id); // Use the helper
        }
      }
    ];

    // Add bookmark commands
    if (currentNode) {
      if (currentBookmark) {
        cmds.push({
          id: `delete-bookmark-${currentBookmark.title}`,
          title: `Remove Bookmark: ${currentBookmark.title}`,
          disabled: status.type === 'loading',
          execute: async () => {
            await deleteBookmark(currentBookmark.title); // Use helper
          }
        });
      } else {
        cmds.push({
          id: 'create-bookmark',
          title: 'Save Bookmark',
          disabled: status.type === 'loading',
          execute: async () => {
            const title = prompt('Enter bookmark title:');
            if (title) {
              await saveBookmark(title); // Use helper
            }
          }
        });
      }
    }

    // Add bookmark navigation commands
    bookmarks.forEach(bookmark => {
      const rootId = bookmark.rootId;
      const root = state.roots.find(r => r.id === rootId);
      if (!root) return; // Skip if root not found
      cmds.push({
        id: `navigate-bookmark-${bookmark.title}`,
        title: `Go to: ${bookmark.title}`,
        description: `System Prompt: ${root.config.systemPrompt ?? '(empty system prompt)'}`,
        disabled:
          status.type === 'loading' || bookmark.nodeId === currentNode?.id,
        execute: async () => {
          navigateToNode(bookmark.nodeId); // Use helper
        }
      });
    });

    state.roots.forEach(root => {
      const systemPrompt =
        root.config.systemPrompt?.replace(/[\n\r]+/g, ' ') ?? '(empty)';

      cmds.push({
        id: `navigate-root-${root.id}`,
        title: `Go to conversation`,
        description: `System Prompt: ${systemPrompt}`,
        disabled: status.type === 'loading' || root.id === currentRootId,
        execute: async () => {
          navigateToNode(root.id); // Use helper
        }
      });
    });

    // Add node management commands
    if (currentNode?.id) {
      const nodeId = currentNode.id; // Capture for async execute
      cmds.push({
        id: 'delete-children',
        title: 'Delete All Children',
        description: `Delete ${children.length} children`,
        disabled: !children.length || status.type === 'loading',
        execute: async () => {
          if (window.confirm('Delete all children of this node?')) {
            await deleteChildren(nodeId); // Use helper
          }
        }
      });

      // Check if there are actual siblings (excluding self)
      const hasSiblings = siblings.length > 1;
      cmds.push({
        id: 'delete-siblings',
        title: 'Delete All Siblings (Except This)',
        description: `Delete ${siblings.length} siblings`,
        disabled: !hasSiblings || status.type === 'loading',
        execute: async () => {
          if (
            window.confirm(
              'Delete all siblings of this node (excluding this one)?'
            )
          ) {
            await deleteSiblings(nodeId); // Use helper
          }
        }
      });

      // Can only delete the current node if it has a parent (is not root)
      const nodeIsRoot = messages.length === 0; // Approximiation: root has no messages in path
      cmds.push({
        id: 'delete-node',
        title: 'Delete This Node',
        disabled: nodeIsRoot || status.type === 'loading', // Cannot delete root or while loading
        execute: async () => {
          if (window.confirm('Delete this node and all its descendants?')) {
            await deleteNode(nodeId); // Use helper
          }
        }
      });
    }

    // Add Copy commands
    if (messages.length > 0) {
      cmds.push({
        id: 'copy-context-markdown',
        title: 'Copy Current Context (Markdown)',
        disabled: !currentNode || messages.length === 0,
        execute: async () => {
          // Format messages into markdown
          let markdownText = '';

          // Include system prompt if available
          if (root?.systemPrompt) {
            markdownText += `**System Prompt:**\n\n${root.systemPrompt}\n\n`;
          }

          // Add each message with role prefix
          messages.forEach(message => {
            const rolePrefix =
              message.role === 'user' ? '**User:**' : '**Assistant:**';
            markdownText += `${rolePrefix}\n\n${message.content}\n\n`;
          });

          await copyToClipboard(
            markdownText,
            'Context copied to clipboard as Markdown'
          );
        }
      });
    }

    cmds.push({
      id: 'copy-children',
      title: 'Copy All Children',
      disabled: !currentNode || children.length === 0,
      execute: async () => {
        let text = '';
        for (let i = 0; i < children.length; i++) {
          text += `======= completion ${i} =======\n`;
          text += children[i].message.content + '\n';
          text += `======= end completion ${i} =======\n\n`;
        }
        await copyToClipboard(text, 'Children copied to clipboard');
      }
    });

    // Add "Use Defaults" command
    cmds.push({
      id: 'activate-preset-default',
      title: `Activate Preset: Default Parameters ${activePresetName === null ? '✓' : ''}`,
      disabled: status.type === 'loading' || activePresetName === null,
      execute: async () => {
        await handleSetActivePreset(null);
      }
    });

    // Add commands for each defined preset
    Object.entries(presets).forEach(([name, _preset]) => {
      const isActive = activePresetName === name;
      cmds.push({
        id: `activate-preset-${name}`,
        title: `Activate Preset: ${name} ${isActive ? '✓' : ''}`,
        disabled: status.type === 'loading' || isActive,
        execute: async () => {
          await handleSetActivePreset(name);
        }
      });
    });

    // Add model selection commands
    Object.entries(KNOWN_MODELS).forEach(([modelString, _config]) => {
      try {
        const { provider, model } = parseModelString(modelString);
        const isCurrentModel =
          currentProviderName === provider && currentModelName === model;
        cmds.push({
          id: `use-model-${modelString}`,
          title: `Use Model: ${modelString} ${isCurrentModel ? '✓' : ''}`,
          disabled: status.type === 'loading' || isCurrentModel,
          execute: async () => {
            dispatch({
              type: 'SET_CURRENT_GENERATION_MODEL',
              payload: { providerName: provider, modelName: model }
            });
          }
        });
      } catch (error) {
        console.warn(
          'Failed to parse model string for command:',
          modelString,
          error
        );
      }
    });

    cmds.push({
      id: 'create-new-conversation',
      title: 'Create New Conversation (System Prompt)...',
      disabled: status.type === 'loading' || status.type === 'initializing',
      execute: async () => {
        dispatch({ type: 'OPEN_MODEL_SWITCHER' });
      }
    });

    // Commands to control graph view
    cmds.push({
      id: 'graph-view-mode-single-root',
      title: 'Graph View: Single Root',
      disabled: graphTopology.length === 0,
      execute: async () => {
        dispatch({
          type: 'SET_GRAPH_VIEW_MODE',
          payload: { mode: 'single-root' }
        });
      }
    });

    cmds.push({
      id: 'graph-view-mode-multi-root',
      title: 'Graph View: Multi Root',
      disabled: graphTopology.length === 0,
      execute: async () => {
        dispatch({
          type: 'SET_GRAPH_VIEW_MODE',
          payload: { mode: 'multi-root' }
        });
      }
    });

    // Add rendering mode toggle command
    cmds.push({
      id: 'toggle-rendering-mode',
      title: `Rendering Mode: ${state.renderingMode === 'markdown' ? 'Markdown' : 'Raw'} (Click to toggle)`,
      execute: async () => {
        dispatch({ type: 'TOGGLE_RENDERING_MODE' });
      }
    });

    cmds.push({
      id: 'graph-view-mode-compact',
      title: 'Graph View: Compact',
      disabled: graphTopology.length === 0,
      execute: async () => {
        dispatch({
          type: 'SET_GRAPH_VIEW_MODE',
          payload: { mode: 'compact' }
        });
      }
    });

    return cmds;
  }, [
    requestOnSubmit,
    currentNode,
    root,
    messages,
    navigateToParent,
    status.type,
    bookmarks,
    state.roots,
    children,
    activePresetName,
    presets,
    graphTopology.length,
    dispatch,
    handleGenerate,
    currentBookmark,
    deleteBookmark,
    saveBookmark,
    navigateToNode,
    currentRootId,
    siblings.length,
    deleteChildren,
    deleteSiblings,
    deleteNode,
    copyToClipboard,
    handleSetActivePreset,
    currentProviderName,
    currentModelName,
    state.renderingMode
  ]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Command palette
      if ((event.metaKey || event.ctrlKey) && event.key === 'p') {
        event.preventDefault();
        if (paletteState.status === 'closed') {
          dispatch({ type: 'PALETTE_OPEN' });
        } else {
          dispatch({ type: 'PALETTE_CLOSE' });
        }
      }

      // Navigate to parent (Escape) only when palette is closed
      if (event.key === 'Escape' && paletteState.status === 'closed') {
        event.preventDefault();
        navigateToParent(); // Use the helper
      }
      // Note: Palette handles its own Escape keydown when open
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateToParent, dispatch, paletteState.status]); // Add dispatch and paletteState.status

  // --- Rendering ---
  const isLoading = status.type === 'loading' || status.type === 'initializing';

  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text">
      <StatusBar
        currentNodeId={currentNode?.id ?? null}
        siblings={siblings}
        bookmark={currentBookmark}
        status={status}
        currentProviderName={currentProviderName}
        currentModelName={currentModelName}
        onNavigateToParent={navigateToParent} // Pass helper
      />

      {/* Panel Group takes up remaining flexible space */}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={40} minSize={20}>
          <PanelGroup
            direction="vertical"
            className="h-full border-l border-terminal-border"
          >
            <Panel defaultSize={70} minSize={30}>
              <GraphView
                state={state.graphViewState}
                topology={graphTopology}
                bookmarks={bookmarks}
                currentPath={state.messages.map(m => m.nodeId)}
                currentNodeId={currentNode?.id ?? null}
                currentRootId={currentRootId ?? null}
                onNodeClick={navigateToNode}
                onNodeHover={previewNode}
              />
            </Panel>
            <PanelResizeHandle className="h-2 bg-terminal-border hover:bg-terminal-focus transition-colors" />
            <Panel defaultSize={30} minSize={15}>
              <div className="p-4 h-full overflow-y-auto border-t border-terminal-border">
                <ToolsPanel
                  availableTools={tools.available}
                  toolGroups={tools.groups}
                  ungroupedTools={tools.ungroupedTools}
                  activeToolNames={tools.active}
                  onToggleTool={handleToggleTool}
                  onToggleToolGroup={handleToggleToolGroup}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="w-2 bg-terminal-border hover:bg-terminal-focus transition-colors" />
        <Panel defaultSize={60} minSize={30}>
          <div className="flex flex-col h-full">
            {/* Ensure panel content uses full height */}
            <ContextView
              messages={messages}
              root={root}
              siblings={siblings}
              onNavigateToNode={navigateToNode} // Pass helper
              previewChild={previewChild}
              onCopy={copyToClipboard}
              onEditSave={handleEditSave}
              onSystemPromptSave={handleSystemPromptSave}
            />
          </div>
        </Panel>
      </PanelGroup>

      <InputArea
        onSend={handleSendMessage} // Pass helper
        disabled={isLoading} // Use derived loading state
        requestOnSubmit={requestOnSubmit}
        role={inputRole}
        generationParams={effectiveGenerationParams}
        handleLargePaste={handleLargePasteSubmit}
        currentNodeId={currentNode?.id} // Pass current node ID
      />

      <ChildNavigator
        children={children}
        onNavigate={navigateToNode}
        disabled={isLoading}
        onFocusChange={nodeData =>
          dispatch({ type: 'SET_PREVIEW_CHILD', payload: { nodeData } })
        }
        previewChild={previewChild}
      />

      <CommandPalette
        isOpen={paletteState.status === 'open'}
        onClose={() => dispatch({ type: 'PALETTE_CLOSE' })} // Dispatch action
        commands={commands()} // Pass generated commands
        onExecuteCommand={handleExecuteCommand} // Pass helper
        query={paletteState.status === 'open' ? paletteState.query : ''}
        selectedIndex={
          paletteState.status === 'open' ? paletteState.selectedIndex : 0
        }
        onQueryChange={query =>
          dispatch({ type: 'PALETTE_UPDATE_QUERY', payload: { query } })
        }
        onSelectedIndexChange={index =>
          dispatch({ type: 'PALETTE_SET_SELECTED_INDEX', payload: { index } })
        }
      />

      <ModelSwitcherModal
        isOpen={isModelSwitcherOpen}
        onClose={() => dispatch({ type: 'CLOSE_MODEL_SWITCHER' })}
        onSwitch={handleCreateNewRoot}
      />
    </div>
  );
}

// Main App Component (Provider Wrapper)
function App() {
  return (
    <AppProvider>
      <Routes>
        <Route index element={<HomeView />} />
        <Route path="/nodes/:nodeId" element={<AppContent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProvider>
  );
}

export default App;
