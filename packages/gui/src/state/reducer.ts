import type { GuiAppState, GuiAppAction } from './types';

export function guiAppReducer(
  state: GuiAppState,
  action: GuiAppAction
): GuiAppState {
  console.log(action.type, action);
  switch (action.type) {
    // --- Status Management ---
    case 'SET_STATUS_LOADING':
      // Avoid overriding error state unless intentionally cleared
      if (state.status.type === 'error') return state;
      return {
        ...state,
        status: { type: 'loading', operation: action.payload?.operation }
      };
    case 'SET_STATUS_IDLE':
      // Only transition from loading or error to idle
      if (state.status.type === 'loading' || state.status.type === 'error') {
        return { ...state, status: { type: 'idle' } };
      }
      return state; // No change if already idle or initializing
    case 'SET_STATUS_ERROR':
      return {
        ...state,
        status: { type: 'error', message: action.payload.message }
      };

    // --- Initialization & Data Loading Results ---
    case 'INITIALIZE_SUCCESS':
      return {
        ...state,
        status: { type: 'idle' }, // Move to idle after init
        bookmarks: action.payload.bookmarks
      };
    case 'LOAD_NODE_DATA_SUCCESS': {
      // Ensure we only transition if we were loading or initializing
      // This prevents accidental state updates if actions arrive out of order
      if (
        state.status.type !== 'loading' &&
        state.status.type !== 'initializing'
      ) {
        console.warn('LOAD_NODE_DATA_SUCCESS received while not loading.');
        // Decide how to handle this - maybe ignore, maybe force update?
        // For now, let's proceed, but log a warning.
      }
      const { node, root, messages, siblings, children } = action.payload;
      return {
        ...state,
        currentNode: node,
        root,
        messages,
        children,
        siblings,
        previewChild: null // Reset preview on navigation
      };
    }

    // --- UI Input State ---
    case 'SET_INPUT_ROLE':
      return { ...state, inputRole: action.payload.role };
    case 'TOGGLE_REQUEST_ON_SUBMIT':
      return { ...state, requestOnSubmit: !state.requestOnSubmit };

    // --- UI Interaction State ---
    case 'SET_PREVIEW_CHILD':
      return { ...state, previewChild: action.payload.nodeData };

    // --- Command Palette ---
    case 'PALETTE_OPEN':
      // Reset query and index when opening
      return {
        ...state,
        paletteState: { status: 'open', query: '', selectedIndex: 0 }
      };
    case 'PALETTE_CLOSE':
      if (state.paletteState.status === 'closed') return state; // No change needed
      return { ...state, paletteState: { status: 'closed' } };
    case 'PALETTE_UPDATE_QUERY':
      if (state.paletteState.status !== 'open') return state;
      // Reset index when query changes
      return {
        ...state,
        paletteState: {
          ...state.paletteState,
          query: action.payload.query,
          selectedIndex: 0
        }
      };
    case 'PALETTE_SET_SELECTED_INDEX':
      if (state.paletteState.status !== 'open') return state;
      return {
        ...state,
        paletteState: {
          ...state.paletteState,
          selectedIndex: action.payload.index
        }
      };

    // --- Metadata Updates ---
    case 'SET_BOOKMARKS':
      return { ...state, bookmarks: action.payload.bookmarks };
    case 'SET_ROOTS':
      return { ...state, roots: action.payload.roots };

    // --- Model Switcher Modal ---
    case 'OPEN_MODEL_SWITCHER':
      return { ...state, isModelSwitcherOpen: true };
    case 'CLOSE_MODEL_SWITCHER':
      // Avoid changing state if already closed
      if (!state.isModelSwitcherOpen) return state;
      return { ...state, isModelSwitcherOpen: false };

    // --- Dynamic Model Selection ---
    case 'SET_CURRENT_GENERATION_MODEL':
      return {
        ...state,
        currentProviderName: action.payload.providerName,
        currentModelName: action.payload.modelName
      };

    // --- Generation Presets ---
    case 'SET_PRESET_CONFIG':
      return {
        ...state,
        presets: action.payload.presets,
        activePresetName: action.payload.activePresetName
      };
    case 'SET_DEFAULT_PARAMETERS':
      return { ...state, defaultParameters: action.payload.parameters };
    case 'SET_ACTIVE_PRESET_NAME':
      return { ...state, activePresetName: action.payload.name };

    case 'SET_GRAPH_VIEW_MODE':
      return {
        ...state,
        graphViewState: {
          ...state.graphViewState,
          mode: action.payload.mode
        }
      };

    case 'SET_GRAPH_HOVER_PREVIEW':
      if (action.payload.nodeId === null) {
        return {
          ...state,
          graphViewState: {
            ...state.graphViewState,
            previewNodeId: null
          }
        };
      } else {
        return {
          ...state,
          graphViewState: {
            ...state.graphViewState,
            previewNodeId: action.payload.nodeId,
            previewMessages: action.payload.messages,
            previewRoot: action.payload.root
          }
        };
      }

    // --- Rendering Mode ---
    case 'TOGGLE_RENDERING_MODE':
      return {
        ...state,
        renderingMode: state.renderingMode === 'markdown' ? 'raw' : 'markdown'
      };

    default:
      // Ensure all action types are handled (useful for type checking)
      action satisfies never;
      console.warn('Unhandled action type:', action);
      return state;
  }
}
