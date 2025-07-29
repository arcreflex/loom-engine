import type {
  NodeId,
  RootConfig,
  NodeData,
  Role,
  Bookmark,
  RootData,
  ProviderName
} from '@ankhdt/loom-engine';
import type {
  DisplayMessage,
  GenerateOptions,
  GetNodeResponse
} from '../types';
import type { PresetDefinition } from '../api';
import { GraphViewState } from '../components/GraphView';
import { ModelSourceInfo } from '../../../engine/src/types';

/**
 * Defines the possible operational statuses of the GUI application.
 */
export type Status =
  | { type: 'initializing' }
  | { type: 'idle' }
  | { type: 'loading'; operation?: string }
  | { type: 'error'; message: string };

/**
 * Defines the state of the command palette, including whether it's open,
 * the current query, and the selected command index.
 */
export type PaletteStatus =
  | { status: 'closed' }
  | {
      status: 'open';
      query: string;
      selectedIndex: number;
    };

/**
 * Defines actions available in the Zustand store
 */
export interface GuiAppActions {
  // Status management
  setStatus: (status: Status) => void;
  setStatusLoading: (operation?: string) => void;
  setStatusIdle: () => void;
  setStatusError: (message: string) => void;

  // Internal helper functions (do not manage status)
  _loadNodeData: (nodeId: NodeId) => Promise<void>;

  // Navigation management
  setPendingNavigation: (nodeId: NodeId | null) => void;
  clearPendingNavigation: () => void;

  // Core navigation and data loading
  navigateToNode: (nodeId: NodeId) => Promise<void>;
  refreshTopology: () => Promise<void>;

  // Data initialization
  fetchInitialData: () => Promise<void>;

  // UI state management
  setInputRole: (role: Role) => void;
  toggleRequestOnSubmit: () => void;
  setPreviewChild: (nodeData: NodeData | null) => void;

  // Message and generation actions
  submitInput: (
    role: Role,
    content: string,
    generateAfter: boolean
  ) => Promise<void>;
  handleLargePasteSubmit: (content: string) => Promise<void>;

  startGenerationForNode: (
    parentNodeId: NodeId,
    options?: Partial<GenerateOptions>
  ) => Promise<void>;
  subscribeToGeneration: (nodeId: NodeId) => void;
  unsubscribeFromGeneration: () => void;

  // Bookmark management
  saveBookmark: (title: string) => Promise<void>;
  deleteBookmark: (title: string) => Promise<void>;
  refreshBookmarks: () => Promise<void>;

  // Node management
  deleteNode: (nodeId: NodeId) => Promise<void>;
  deleteChildren: (nodeId: NodeId) => Promise<void>;
  deleteSiblings: (nodeId: NodeId) => Promise<void>;

  // Editing
  handleEditSave: (nodeId: NodeId, newContent: string) => Promise<void>;
  handleSystemPromptSave: (newPrompt: string) => Promise<void>;

  // Model and preset management
  setCurrentModel: (providerName: ProviderName, modelName: string) => void;
  setActivePreset: (name: string | null) => Promise<void>;

  // Command palette
  openPalette: () => void;
  closePalette: () => void;
  updatePaletteQuery: (query: string) => void;
  setPaletteSelectedIndex: (index: number) => void;

  // Modal management
  openModelSwitcher: () => void;
  closeModelSwitcher: () => void;

  // Graph view
  setGraphViewMode: (mode: GraphViewState['mode']) => void;
  setGraphHoverPreview: (
    nodeId: NodeId | null,
    messages?: DisplayMessage[],
    root?: RootConfig
  ) => void;

  // Rendering mode
  toggleRenderingMode: () => void;

  // Tool management
  toggleTool: (toolName: string) => void;
  toggleToolGroup: (groupName: string) => void;
  setActiveTools: (toolNames: string[]) => void;

  // Root/conversation management
  createNewRoot: (systemPrompt?: string) => Promise<void>;
  navigateToParent: () => Promise<void>;

  // Helper methods (internal)
  initializeModelSelection: (messages: DisplayMessage[]) => void;
  setDefaultToolsFromSourceInfo: (sourceInfo: ModelSourceInfo) => void;
}

/**
 * Represents the complete state of the Loom GUI application.
 */
export interface GuiAppState {
  // Core Data
  currentNode: GetNodeResponse | null;
  root: RootConfig | null;
  messages: DisplayMessage[];
  children: NodeData[];
  siblings: NodeData[];

  // UI Interaction State
  inputRole: Role;
  requestOnSubmit: boolean;
  previewChild: NodeData | null;

  // Navigation intent - when set, the UI should navigate
  pendingNavigation: NodeId | null;

  // NEW: Track the single pending generation we're monitoring
  pendingGeneration: {
    nodeId: NodeId;
    subscription: EventSource | null;
    startedAt: Date;
  } | null;

  // Application Status
  status: Status;

  // Metadata
  bookmarks: Bookmark[];
  roots: RootData[];

  // Generation Presets
  presets: { [name: string]: PresetDefinition };
  activePresetName: string | null;
  defaultParameters: GenerateOptions | null;

  // Component State
  paletteState: PaletteStatus;
  isModelSwitcherOpen: boolean;

  // Dynamic Model Selection
  currentProviderName: ProviderName | null;
  currentModelName: string | null;

  // Graph View
  graphViewState: GraphViewState;

  // Rendering Mode
  renderingMode: 'markdown' | 'raw';

  // Tools Management
  tools: {
    available: Array<{
      name: string;
      description: string;
      parameters: object;
      group?: string;
    }>;
    groups: Array<{
      name: string;
      description?: string;
      tools: string[];
    }>;
    ungroupedTools: string[];
    active: string[];
  };

  // Actions
  actions: GuiAppActions;
}
