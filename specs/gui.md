# GUI

UI architecture and flows, including server interactions.

## Structure

### Application Architecture
**SPA + Backend**: React frontend with Express backend for API and SSE
**State Management**: Zustand store as single source of truth for UI state
**Rendering**: Vite development server with HMR, production builds

### Main Views
**HomeView**: Root conversation selection and management
**NodeView**: Individual conversation node display and interaction
**Graph View**: Visual tree representation with navigation

## Core Flows

### Navigation and Load
**Data Gathering**:
1. Load conversation list from backend
2. Fetch current node data if bookmark exists
3. Populate Zustand store with initial state
4. Render appropriate view based on current state

**pendingNavigation Semantics**:
- **Optimistic updates**: UI shows intended destination immediately
- **Rollback mechanism**: Revert if navigation fails
- **Loading states**: Visual feedback during navigation

### Submit Input with Generation
**Input Flow**:
1. User enters text in input field
2. Optional generation parameters selection
3. Submit triggers POST to backend with input and parameters

**Generation Process**:
1. Backend appends user input to conversation
2. Backend initiates generation with selected provider
3. SSE stream provides real-time generation updates
4. Frontend updates UI with partial responses

**Post-generation**:
1. Children list updated with new nodes
2. Auto-navigation to newly generated response (configurable)
3. Input field cleared and ready for next interaction

### Edit Flow (Branching)
**Edit Initiation**:
1. User clicks edit button on existing node
2. Node content loaded into edit mode
3. Original content preserved for comparison

**Branch Creation**:
1. User modifies content and submits
2. Backend creates new branch using LCP algorithm
3. UI updates to show new branch
4. Navigation automatically follows new branch

**System Prompt Editing**:
Editing system prompt creates/selects new Root via Forest.getOrCreateRoot rather than mutating existing Root (see Root immutability in data-model.md). Server's POST /api/roots uses this behavior to find matching roots or create new ones.

**Metadata Modal**:
- Edit node metadata (tags, custom data)
- View generation parameters and source info
- Access to advanced node operations

### Bookmark CRUD and Guardrails
**Creation**: Save current node as named bookmark
**Updates**: Automatically update "current" bookmark on navigation
**Deletion**: Remove bookmarks with confirmation
**Validation**: Check bookmark validity before navigation
**Guardrails**: Prevent navigation to deleted or invalid nodes

### Tool Activation UX
**Per-tool Control**: Individual checkboxes for each available tool
**Group Control**: Enable/disable entire tool categories
**Generation Request Integration**: Selected tools included in generation parameters
**Visual Feedback**: Clear indication of which tools are active

**Tool Status Display**:
- Available tools list with descriptions
- Active/inactive status indication
- Tool execution results in conversation

### Graph View Modes
**single-root**: Display single conversation tree
**multi-root**: Display multiple conversation trees
**compact**: Condensed view for large conversations

**Hover Preview**:
- Node content preview without navigation
- Metadata display (generation parameters, timestamps)
- Note: Quick actions in hover are not implemented

## Rendering Modes

### Markdown vs Raw
**Markdown Mode**: 
- Render assistant responses as formatted markdown
- Syntax highlighting for code blocks
- Link handling and media embedding

**Raw Mode**:
- Display exact text content without formatting
- Useful for debugging and exact content inspection
- Preserve whitespace and special characters

**Toggle Behavior**: Per-message or global mode switching

## Error/Status Display Patterns

### Error Categories
**Network Errors**: Connection failures, timeouts
**Generation Errors**: Provider failures, rate limits
**Validation Errors**: Invalid input, parameter errors
**System Errors**: Internal application errors

### Display Strategies
**Inline Errors**: Show errors in context where they occurred
**Status Bar**: Persistent status for ongoing operations
**Error handling**: Basic error display (toast notifications and error boundaries not implemented)

### Recovery Actions
**Retry Mechanisms**: Automatic and manual retry options
**Fallback Content**: Show last known good state
**Error Reporting**: Optional error reporting to developers

## Server Interaction (Moved from server-api)

### Server API
The server exposes a thin `/api` surface for nodes, roots, bookmarks, models, tools, topology, and SSE updates. The server is a pass-through to Engine with minimal business logic. See server.ts for the exact endpoint list.

**SSE payload shape** (stable contract): `{ status: 'pending' | 'idle' | 'error', added?: NodeData[], error?: string }`

### SSE Subscription Lifecycle
**Connection Establishment**:
1. Frontend connects to `/api/nodes/:nodeId/generation` SSE endpoint
2. Backend maintains client connection registry
3. No client heartbeat pings

**Event Streaming**:
1. Generation requests trigger SSE events
2. Event payload: `{ status: 'pending' | 'idle' | 'error', added?: NodeData[], error?: string }`
3. Not chunked token streams - discrete status updates with complete nodes
4. Tool-calling recursion handled via GenerateResult.next promise chain

**Connection Management**:
- Automatic reconnection on connection loss
- Client-side buffering of missed events
- Graceful degradation without SSE support

### Request/Response Shapes
**Note**: Specific schemas not detailed here (see API implementation)
**Principle**: JSON-based communication with consistent error formats
**Streaming**: SSE for real-time updates, HTTP for discrete operations

## State Management (Zustand)

### Store Structure
Zustand store is used as single source of truth for UI state. See `state/types.ts` for complete interface definitions. Key state includes:
- Current conversation state (currentRootId, currentNodeId)
- Conversation data and tree structure
- UI state (sidebar, view modes, rendering preferences)
- Generation state and active tools
- Graph view state and hover previews

### Actions and Updates
**Navigation**: Update current node/root with optimistic updates
**Generation**: Manage generation state and real-time updates
**Tool Management**: Track active tools for generation
**Settings**: Persist user preferences

## Component Architecture

### Layout Components
**AppLayout**: Root component with navigation and main content area
**Sidebar**: Conversation list and navigation
**MainContent**: Current view rendering (Home, Node, Graph)

### Conversation Components
**ConversationList**: Display available conversations
**NodeDisplay**: Render individual conversation nodes
**MessageComponent**: Individual message rendering with role-specific styling
**InputForm**: User input with generation controls

### Graph Components
**GraphView**: SVG-based tree visualization
**NodeComponent**: Individual nodes in graph view
**EdgeComponent**: Connection lines between nodes

## Performance Considerations

### Lazy Loading
**Conversation Content**: Load node content on-demand
**Large Trees**: Virtualized rendering for large conversation trees
**Image/Media**: Lazy load embedded media content

### Caching Strategy
**Client-side Caching**: Cache conversation data in memory
**Invalidation**: Clear cache on server updates
**Persistent Storage**: Optional localStorage for offline capability

### Optimization Techniques
**React Optimization**: Memoization, React.memo, useMemo
**Bundle Splitting**: Code splitting for large dependencies
**Asset Optimization**: Image compression, font loading

## Non-goals

This specification does not cover:
- Component-level prop documentation (see TypeScript interfaces)
- Specific CSS/styling implementations
- Detailed accessibility specifications
- Mobile responsive design requirements
- Internationalization and localization