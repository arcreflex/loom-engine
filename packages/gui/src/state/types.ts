import type {
  NodeId,
  RootConfig,
  Node,
  NodeData,
  Role,
  Bookmark,
  RootData,
  ProviderName
} from '@ankhdt/loom-engine';
import type { DisplayMessage, GenerateOptions } from '../types';
import type { PresetDefinition } from '../api';
import { GraphViewState } from '../components/GraphView';

/**
 * Defines the possible operational statuses of the GUI application.
 */
export type Status =
  | { type: 'initializing' } // Added distinct state for initial load
  | { type: 'idle' }
  | { type: 'loading'; operation?: string } // Optional description of what's loading
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
 * Represents the complete state of the Loom GUI application.
 */
export interface GuiAppState {
  // --- Core Data (Reflects the current view of the Loom) ---

  currentNode: Node | null;
  /** Configuration of the root node for the current conversation. */
  root: RootConfig | null;
  /** The list of messages forming the path to the currentNodeId. */
  messages: DisplayMessage[];
  /** The direct children of the currentNodeId. */
  children: NodeData[];
  /** The siblings of the currentNodeId (including itself). */
  siblings: NodeData[];

  // --- UI Interaction State ---
  /** The role ('user' or 'assistant') for the next message input. */
  inputRole: Role;
  /** Whether an LLM request should be automatically sent after submitting input. */
  requestOnSubmit: boolean;
  /** The child node currently being previewed in the context view (if any). */
  previewChild: NodeData | null;

  // --- Application Status ---
  /** The current operational status (e.g., loading, idle, error). */
  status: Status;

  // --- Metadata ---
  /** The list of saved bookmarks. */
  bookmarks: Bookmark[];

  /** The list of root nodes (conversations) available in the application. */
  roots: RootData[];

  // --- Generation Presets ---
  /** Available generation parameter presets */
  presets: { [name: string]: PresetDefinition };
  /** Currently active preset name (null means use defaults) */
  activePresetName: string | null;
  /** Default generation parameters */
  defaultParameters: GenerateOptions | null;

  // --- Component State ---
  /** The state of the command palette component. */
  paletteState: PaletteStatus;

  /** Whether the model switcher modal is open */
  isModelSwitcherOpen: boolean;

  // --- Dynamic Model Selection ---
  /** Currently selected provider for generation */
  currentProviderName: ProviderName | null;
  /** Currently selected model for generation */
  currentModelName: string | null;

  // --- Graph View ---
  /** The current layout mode for the graph view. */
  graphViewState: GraphViewState;
}

// Define the Action types
export type GuiAppAction =
  // --- Status Management ---
  | { type: 'SET_STATUS_LOADING'; payload?: { operation?: string } }
  | { type: 'SET_STATUS_IDLE' }
  | { type: 'SET_STATUS_ERROR'; payload: { message: string } }

  // --- Initialization & Data Loading Results ---
  | {
      type: 'INITIALIZE_SUCCESS';
      payload: { initialNodeId: NodeId | null; bookmarks: Bookmark[] };
    }
  | {
      type: 'LOAD_NODE_DATA_SUCCESS';
      payload: {
        node: Node;
        root: RootConfig;
        messages: DisplayMessage[];
        children: NodeData[];
        siblings: NodeData[];
      };
    }

  // --- UI Input State ---
  | { type: 'SET_INPUT_ROLE'; payload: { role: Role } }
  | { type: 'TOGGLE_REQUEST_ON_SUBMIT' }

  // --- UI Interaction State ---
  | { type: 'SET_PREVIEW_CHILD'; payload: { nodeData: NodeData | null } }

  // --- Command Palette ---
  | { type: 'PALETTE_OPEN' }
  | { type: 'PALETTE_CLOSE' }
  | { type: 'PALETTE_UPDATE_QUERY'; payload: { query: string } }
  | { type: 'PALETTE_SET_SELECTED_INDEX'; payload: { index: number } }

  // --- Metadata Updates ---
  | { type: 'SET_BOOKMARKS'; payload: { bookmarks: Bookmark[] } }
  | { type: 'SET_ROOTS'; payload: { roots: RootData[] } }

  // --- Model Switcher Modal ---
  | { type: 'OPEN_MODEL_SWITCHER' }
  | { type: 'CLOSE_MODEL_SWITCHER' }

  // --- Dynamic Model Selection ---
  | {
      type: 'SET_CURRENT_GENERATION_MODEL';
      payload: { providerName: ProviderName; modelName: string };
    }

  // --- Generation Presets ---
  | {
      type: 'SET_PRESET_CONFIG';
      payload: {
        presets: { [name: string]: PresetDefinition };
        activePresetName: string | null;
      };
    }
  | { type: 'SET_DEFAULT_PARAMETERS'; payload: { parameters: GenerateOptions } }
  | { type: 'SET_ACTIVE_PRESET_NAME'; payload: { name: string | null } }

  // --- Graph View ---
  | { type: 'SET_GRAPH_VIEW_MODE'; payload: { mode: GraphViewState['mode'] } }
  | {
      type: 'SET_GRAPH_HOVER_PREVIEW';
      payload:
        | { nodeId: NodeId; messages: DisplayMessage[]; root: RootConfig }
        | { nodeId: null };
    };
