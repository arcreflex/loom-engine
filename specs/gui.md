# GUI

Authoritative description of the GUI architecture and behavior.

## Overview

- SPA with backend: React frontend + Express backend (API + SSE)
- State: Zustand store is the single source of truth for UI state
- Build/runtime: Vite (dev), production builds; Node server wraps engine

## Aesthetics & Interaction Philosophy

The GUI aims for a calm, fast, and legible terminal‑inspired feel. Visuals are deliberately restrained—monospace typography, low‑chroma palette, thin borders—so information density and hierarchy do the work, not chrome. Interactions prefer keyboard velocity and predictable semantics: the command palette is the “center”, destructive actions ask for confirmation, and global toggles trade per‑widget cleverness for consistency. Layout changes avoid jank; we reserve space (e.g., for child previews) and minimize reflows and surprise auto‑scrolls. Navigation is grounded in conversation structure, with bookmarks as durable affordances and guardrails that prevent accidental loss. We try to surface state plainly (status bar, LEDs, inline text) and keep power tucked behind progressive disclosure (palette, hover previews, collapsible tool groups). Text stays first‑class—markdown, code, copy/export—and streaming focuses on discrete, meaningful updates instead of theatrical token dribble. Overall: quiet UI, keyboard‑friendly flow, stable layout, explicit state, and user control over model, presets, and tools.

## Views

- HomeView: Bookmarks, recent leaves (`listRecentLeaves`), roots list
- NodeView: Conversation context, child navigator, tools, input
- TreeView (Outline): Left sidebar outline of the current root showing the path, ancestors, siblings, and direct children. Optimized for snappy keyboard navigation and hover preview.
- Compact Graph (optional/flagged): Minimal, read-only graph that shows “current node + path + immediate neighbors” for quick spatial orientation (no global layout or multi-root view).

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
  - (Graph commands removed) // Compact Graph is either off or on behind a feature flag; no runtime mode switching
  - Navigate: Jump to parent/child/prev/next sibling; jump to any outline node via palette
  - Rendering: Toggle between Markdown and Raw
  - Metadata: Show current node metadata modal

## Input & Submission

- Generate on Submit indicator: Inline LED shows ON/OFF (affects only keyboard/submit, not paste)
- Large paste handling:
  - If input is **empty** and pasted text > 500 chars, append as a **user message** and navigate to the new node — **no confirmation**. **Never** auto-generate in response to paste (regardless of Generate-on-Submit).
  - If input is **not empty**, paste goes **into the input** (no append side-effect).
- Submit semantics:
  - **Cmd+Enter** (“send & generate”):
    - If input has text ⇒ append user message and start generation.
    - If input is **empty** ⇒ **generate next assistant message** on the current node (no user message is created).
  - **Ctrl+Enter** (“send only”):
    - If input has text ⇒ append user message only (no generation).
    - If input is **empty** ⇒ **no-op** (toast: “Nothing to send”).
- Focus: Input focuses on node change and when enabled.
- Inline params: Effective generation params (n, temperature, max_tokens) and estimated context token count display above the input.

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
  (Outline previews reuse the same reserved area.)

## Navigation Views

### TreeView (Outline)

- Shows: current path (root→current), ancestors, siblings, and direct children.
- Interactions: arrow keys and Enter to navigate; hover/focus previews use stable reserved space in the ContextView (no reflow).
- Performance: topology (structure-only) API; lazy-load content on demand.

### Compact Graph (optional)

- Feature-flagged preview; hides by default.
- Renders current node + ancestors + immediate neighbors; no single-root/multi-root global layout.
- Click to navigate; hover shows the same previews as the outline.

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

- Engine session API: The backend invokes `generateStream()` and fans its events out over SSE/websocket. Respect the event order (`provider_request` → `provider_response` → `assistant_node` → optional `tool_result_node` → `done`/`error`).
- Cancellation: The UI should expose a cancel affordance that either calls `session.abort(reason)` or aborts the associated `AbortController`, surfacing a `GenerationAbortedError` event to subscribers.
- Auto-navigation: On completion, if exactly one child was added, auto-navigate to it; otherwise reload current node state
- Pending placeholder: When generating, ContextView shows an animated “…” placeholder at the end

## Generation Streaming (SSE)

- The GUI consumes **event-level** updates only—no token-level streams. Events correspond to complete, meaningful units:
  - `provider_request`, `provider_response`, `assistant_node`, `tool_result_node`, terminal `done` or `error`.
- Multiple clients may observe the same session; UI renders only **complete nodes/events** and updates the outline/topology incrementally.
- The “Generate on Submit” toggle does not affect paste and does not alter server event semantics.

## Server contracts surfaced in UI

- Token estimate: Node responses include an approximate contextTokens count for display
- Append/Edit validation: Server only accepts text content for append/edit; tool‑use blocks and empty content are rejected with explicit errors
- Tree traversal: Use `getSubtree(nodeId, { depth })` to hydrate node panes efficiently; reserve `getAllNodeStructures()` for diagnostics/graph view fallbacks.
- Recents: `listRecentLeaves(limit)` powers “Recent” menus without a full tree traversal.
- Bookmarks: `listBookmarks()`, `addBookmark(nodeId, title)`, `removeBookmark(nodeId)` are the supported bookmark primitives; avoid touching config.toml directly.

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
