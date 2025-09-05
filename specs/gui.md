# GUI

Authoritative description of the GUI architecture and behavior.

## Overview

- SPA with backend: React frontend + Express backend (API + SSE)
- State: Zustand store is the single source of truth for UI state
- Build/runtime: Vite (dev), production builds; Node server wraps engine

## Aesthetics & Interaction Philosophy

The GUI aims for a calm, fast, and legible terminal‑inspired feel. Visuals are deliberately restrained—monospace typography, low‑chroma palette, thin borders—so information density and hierarchy do the work, not chrome. Interactions prefer keyboard velocity and predictable semantics: the command palette is the “center”, destructive actions ask for confirmation, and global toggles trade per‑widget cleverness for consistency. Layout changes avoid jank; we reserve space (e.g., for child previews) and minimize reflows and surprise auto‑scrolls. Navigation is grounded in conversation structure, with bookmarks as durable affordances and guardrails that prevent accidental loss. We try to surface state plainly (status bar, LEDs, inline text) and keep power tucked behind progressive disclosure (palette, hover previews, collapsible tool groups). Text stays first‑class—markdown, code, copy/export—and streaming focuses on discrete, meaningful updates instead of theatrical token dribble. Overall: quiet UI, keyboard‑friendly flow, stable layout, explicit state, and user control over model, presets, and tools.

## Views

- HomeView: Bookmarks, roots list, and multi‑root graph with hover previews
- NodeView: Conversation context, child navigator, graph, tools, input
- GraphView: React Flow + Dagre layout for conversation trees

## Keyboard & Commands

- Shortcut: Cmd/Ctrl+P toggles command palette
- Shortcut: Escape navigates to parent when palette is closed
- Submit: Cmd+Enter = send and generate; Ctrl+Enter = send only
- Palette: Fuzzy search (title/description), arrow navigation, Enter executes, Escape closes
- Commands (dynamic list):
  - Set input role (user/assistant)
  - Toggle Generate on Submit (status reflected live in command title)
  - Navigate to parent
  - Bookmark: Save current / Remove current
  - Navigate to bookmark(s)
  - Navigate to root(s) (with system prompt description)
  - Node ops: Delete this node, Delete all children, Delete all siblings except this
  - Copy: Copy current context (Markdown), Copy all children
  - Presets: Activate default or specific named preset (✓ for active)
  - Models: Switch to any model from KNOWN_MODELS (✓ for current)
  - Graph modes: single-root, multi-root, compact
  - Rendering: Toggle between Markdown and Raw
  - Metadata: Show current node metadata modal

## Input & Submission

- Generate on Submit indicator: Inline LED shows ON/OFF
- Large paste handling: If input is empty and pasted text >500 chars, the paste is appended as a user message and the UI navigates to the new node
- Focus: Input focuses on node change and when enabled
- Inline params: Effective generation params (n, temperature, max_tokens) and estimated context token count are displayed above the input

## Context & Messages

- Coalescing: Adjacent messages of same role are visually coalesced for display (presentation‑only)
- Rendering modes: Global toggle between Markdown and Raw
  - Markdown: remark-gfm + code syntax highlighting with copy buttons
  - Raw: exact text with preserved whitespace
- Long content: Messages auto‑collapse when very long; “X more lines – click to expand” reveals full content
- Tool calls: Assistant tool‑use blocks render as expandable “Tool Call” sections with JSON parameters; tool message results render as expandable “Tool Result”
- Inline editing: Messages can be edited inline; saving creates a new node via edit endpoint and auto‑navigates to it
- Scroll behavior: Auto‑scrolls to newest content; floating “Scroll to Latest” button appears when scrolled away
- Child preview polish: ContextView intentionally reserves space below the last message and renders the child preview in a fixed area at the bottom, so hovering in/out of a child does not cause the main context to reflow or scroll

## Graph View

- Modes: single-root, multi-root, compact (current node, its path/ancestors, immediate neighbors)
- Layout: Dagre top‑to‑bottom (TB) via React Flow; fitView with min/max zoom and dotted background
- Styling semantics:
  - Current node and ancestors: higher opacity
  - Bookmark nodes: thicker focus border and larger node size
  - Edges colored by role; current‑path edges are thicker and animated
- Hover preview: Debounced tooltip near cursor showing bookmark title, system prompt, and a subset of recent messages (first + last), pointer‑events disabled
- Click navigation: Clicking a node triggers pending navigation

## Navigation & Child Selection

- Pending navigation: State‑driven intent; NavigationManager reads and clears it after routing
- ChildNavigator: Lists children with role‑colored prefixes, hover/focus previews, and click‑to‑navigate; Message footer shows sibling index and prev/next sibling links

## Bookmarks

- Named bookmarks: Save/delete by title on current node; listed in sidebar and HomeView
- Guardrail on delete: Server refuses deletion of nodes that are bookmarked or have bookmarked descendants (400)

## Models, Presets, and Tools

- Model inference: On node load, current model/provider defaults to the most recent assistant message’s source info (if available)
- Preset merge: Effective params = defaults merged with active preset merged with request overrides; active tools are included in request
- Tools UI: Group tri‑state (indeterminate when partially active), bulk toggle; per‑tool toggles; available tools come from server definitions
- Tool seeding: Active tools auto‑seed from the prior assistant message’s tool list (even if the current node is a user message), filtered to currently available tools

## Status & Layout

- StatusBar: Shows provider/model, compact node id, sibling position, bookmark title, and operation/status (Initializing/Processing/Error)
- Layout: Resizable panels – left column (GraphView over ToolsPanel), right column (ContextView), input at bottom, ChildNavigator below input

## Generation & Streaming

- SSE: Discrete status updates with complete nodes (no token‑level streaming); subscription is set up when a node is pending generation and cleaned up on navigation
- Auto‑navigation: On SSE completion, if exactly one child was added, auto‑navigate to it; otherwise reload current node state
- Pending placeholder: When generating, ContextView shows an animated “…” placeholder at the end

## Server contracts surfaced in UI

- Token estimate: Node responses include an approximate contextTokens count for display
- Append/Edit validation: Server only accepts text content for append/edit; tool‑use blocks and empty content are rejected with explicit errors

## Core Flows

### Initialization and Load

- Fetch roots, bookmarks, presets, defaults, and tools; populate store; render HomeView or NodeView depending on route
- pendingNavigation semantics: visually reflect intended destination immediately, clear after route transition

### Submit Input with Generation

- Append user message; optionally start generation with current model/preset/tools
- Subscribe to SSE for updates; integrate added nodes live; clear subscription on completion or navigation

### Edit Flow (Branching)

- Inline edit of a message creates a new node via server edit endpoint and navigates to it

### System Prompt Editing

- Editing system prompt creates/selects a new Root rather than mutating an existing Root (see data-model.md)

## Rendering Modes

- Global toggle between Markdown and Raw rendering; not per‑message
- Visual coalescing is presentational only and does not affect stored messages

## Error & Status Display

- Categories: network, generation, validation, system
- Strategies: inline/contextual where applicable and StatusBar for global state; no toasts/error boundaries

## State Management

- Store tracks node data, roots, bookmarks, graph view state, presets/defaults, tools, palette/modal state, and pending generation/navigation
- Actions cover navigation, generation, presets/models/tools, editing, and UI state (palette, modals, rendering mode)

## Testing

- Vitest + MSW with mocked endpoints; focus on unit/integration of store and views; minimal E2E
- Prefer role/label selectors; treat console.error as test failure

## Performance Considerations

- Future goals: lazy loading of heavy content, virtualized rendering for large trees, caching and bundle optimizations (see META.md for current gaps)

## Non‑goals

- Component‑level prop docs (see TypeScript)
- Detailed styling and accessibility specifications
- Mobile responsiveness and i18n/l10n
