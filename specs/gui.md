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
**Tree Mode**: Traditional hierarchical tree display
**Conversation Mode**: Linear conversation view with branch indicators
**Compact Mode**: Condensed view for large conversations

**Hover Preview**:
- Node content preview without navigation
- Metadata display (generation parameters, timestamps)
- Quick actions (delete, edit, bookmark)

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
**Toast Notifications**: Temporary notifications for transient errors
**Status Bar**: Persistent status for ongoing operations
**Error Boundaries**: Graceful handling of React component errors

### Recovery Actions
**Retry Mechanisms**: Automatic and manual retry options
**Fallback Content**: Show last known good state
**Error Reporting**: Optional error reporting to developers

## Server Interaction (Moved from server-api)

### High-level Endpoint Roles
**GET /conversations**: List all conversation roots
**GET /conversations/:rootId**: Get conversation tree structure
**GET /conversations/:rootId/nodes/:nodeId**: Get specific node content
**POST /conversations/:rootId/append**: Add user input to conversation
**POST /conversations/:rootId/generate**: Trigger AI generation
**DELETE /conversations/:rootId/nodes/:nodeId**: Delete node

### SSE Subscription Lifecycle
**Connection Establishment**:
1. Frontend connects to `/events` SSE endpoint
2. Backend maintains client connection registry
3. Client sends heartbeat pings to maintain connection

**Event Streaming**:
1. Generation requests trigger SSE events
2. Partial responses streamed as `generation-chunk` events
3. Completion signaled with `generation-complete` event
4. Error conditions sent as `generation-error` events

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
```typescript
interface AppState {
  // Current conversation state
  currentRootId: RootId | null;
  currentNodeId: NodeId | null;
  
  // Conversation data
  conversations: ConversationSummary[];
  currentConversation: ConversationTree | null;
  
  // UI state
  sidebarOpen: boolean;
  viewMode: 'conversation' | 'graph';
  renderMode: 'markdown' | 'raw';
  
  // Generation state
  isGenerating: boolean;
  activeTools: string[];
  generationParameters: GenerationParams;
}
```

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