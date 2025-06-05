import type { GuiAppState } from './types';
import type { Role } from '@ankhdt/loom-engine';

export const initialState: GuiAppState = {
  // Core Data
  currentNode: null,
  root: null,
  messages: [],
  children: [],
  siblings: [],

  // UI Interaction State
  inputRole: 'user' as Role, // Explicitly type 'user'
  requestOnSubmit: true,
  previewChild: null,

  // Application Status
  status: { type: 'initializing' }, // Start in initializing state

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

  // Dynamic Model Selection
  currentProviderName: null,
  currentModelName: null,

  // Graph View
  graphViewState: {
    mode: 'single-root',
    previewNodeId: null
  }
};
