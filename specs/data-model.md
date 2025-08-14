# Data Model and Tree Semantics

Conceptual model and invariants of roots, nodes, messages, and metadata.

## Entities

### Root
- **Purpose**: Top-level container for a conversation tree
- **Identity**: Unique RootId (branded string)
- **Properties**: Creation timestamp, optional metadata
- **Special node**: Every root has an associated system node that serves as the tree root

### Node
- **Purpose**: Individual point in conversation tree, contains exactly one message
- **Identity**: Unique NodeId (branded string), scoped within root
- **Relationships**: Parent/child links forming tree structure
- **Content**: Exactly one Message object
- **Representation**: Forest represents each role turn as a node; the path from root to a node is the conversation history

### Message
Three distinct message types:

1. **User messages**: Human input, plain text content
2. **Assistant messages**: Model responses, may include tool calls
3. **Tool messages**: Results from tool execution

**Message properties**:
- `role`: "user" | "assistant" | "tool"
- `content`: String content (may be null for assistant messages with only tool calls)
- `tool_calls`: Array of tool invocation requests (assistant only)
- `tool_call_id`: Reference to specific tool call (tool messages only)

### NodeMetadata
Optional structured data attached to nodes:
- **source_info**: Provider, model, generation parameters
- **tags**: User-defined labels for organization
- **custom_data**: Arbitrary JSON for extensibility

## Tree Invariants

### Structural Constraints
- **Single root per tree**: Each conversation tree has exactly one root node
- **Parent/child relationships**: Every non-root node has exactly one parent
- **No cycles**: Tree structure prevents circular references
- **ID uniqueness**: NodeId unique within root, RootId globally unique

### Root Node Behavior
- **Special structure**: RootData is a special node with no message; it has config.systemPrompt and child_ids
- **System role rendering**: In serialization, root is rendered as role=system with message equal to the systemPrompt
- **Cannot be deleted**: Root node deletion would orphan entire tree
- **Immutable content**: Root content isn't edited in place; "editing the system prompt" is implemented by creating/selecting a new Root, not by mutating an existing Root

### Path Traversal
- **Deterministic paths**: Path from root to any node is unique
- **Node reuse**: Prefix matching reuses existing child nodes with identical message (role, content, tool calls) under the same parent. Nodes are not shared across different parents/roots
- **Prefix matching**: Navigation follows longest common prefix principle

## Message Semantics

### Content Handling
- **Null content**: Assistant messages may have null content when only tool calls present
- **Coalescing behavior**: Current implementation coalesces adjacent messages with same role (tool messages break adjacency naturally); intended behavior would avoid coalescing assistant messages with tool_calls
- **Tool call structure**: Assistant tool calls followed by corresponding tool results

### Message Equality
Messages considered equal when:
- Same role
- Same content (including null handling)
- Same tool_calls structure (for assistant messages)
- Tool results match by tool_call_id

### Message Ordering
- **Conversation flow**: User → Assistant → Tool (if applicable) → Assistant (continuation)
- **Tool call batching**: Multiple tool calls in single assistant message
- **Result correlation**: Tool results reference specific tool_call_id

## Path/Prefix Semantics

### Path Definition
A path is a sequence of nodes from root to target, representing conversation history.

### Prefix Matching
When appending to existing conversation:
1. Find longest common prefix between new and existing paths
2. Reuse shared portion of conversation
3. Branch at first point of divergence

### Traversal Guarantees
- **Consistency**: Path traversal always produces same message sequence
- **Completeness**: All messages from root to target included in path
- **Ordering**: Messages appear in chronological conversation order

## Editing Semantics

### LCP (Longest Common Prefix)
The editing process:
1. Compare new message sequence with existing path
2. Identify longest common prefix
3. Split existing path at divergence point
4. Attach new content as branch

### Split Behavior
When splitting existing conversation:
- **New branch creation**: Divergent content becomes new branch
- **Parent preservation**: Common prefix remains unchanged
- **Tool message restriction**: Tool messages cannot be split (Forest.splitNode throws for role 'tool')
- **Child reparenting**: Nodes following split point may need reparenting

### Branch Creation Outcomes
- **Preserve history**: Original conversation path remains accessible
- **Enable alternatives**: Multiple response options at any point
- **Maintain context**: Shared prefix provides conversation context

## Deletion Semantics

### Cascade vs Reparent
**Cascade deletion**: Remove node and all descendants
- Used when removing conversation branch permanently
- Affects all child nodes recursively

**Reparent deletion**: Remove node but preserve children
- Children attached to deleted node's parent
- Preserves conversation continuity where possible

### Bookmark Behavior
- **Affected bookmarks**: Delete operation checks for bookmarked nodes
- **Automatic updates**: Bookmarks updated to valid nodes when possible
- **Orphan handling**: Bookmarks to deleted nodes are removed

### Constraints
- **Root protection**: Cannot delete root node
- **Reference checking**: Verify no external references before deletion

## Graph/Topology View

### NodeStructure Intent
Provides content-free view of conversation tree:
- **Performance**: Avoid loading full message content for navigation
- **Structure only**: Parent/child relationships, node existence
- **Cache-friendly**: Lightweight representation for UI rendering

### Scope and Usage
- **Tree navigation**: Sidebar, graph view, path selection
- **Lazy loading**: Content loaded on-demand when viewing specific nodes
- **Consistency**: Topology view reflects current tree state

## Non-goals

This specification does not cover:
- TypeScript type definitions (see `packages/engine/src/types.ts`)
- File format specifications (see persistence spec)
- Wire format for API communication
- Implementation details of tree algorithms