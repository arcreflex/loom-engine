# Data Model and Tree Semantics

Conceptual model and invariants of roots, nodes, messages, and metadata.

## Entities

### Root

- **Purpose**: Top-level container for a conversation tree
- **Identity**: Unique RootId (branded string)
- **Properties**: Creation timestamp, optional metadata
- **Structure**: RootData is a special node with no message; systemPrompt is rendered as system role during serialization

### Node

- **Purpose**: Individual point in conversation tree, contains exactly one message
- **Identity**: Unique NodeId (branded string), scoped within root
- **Relationships**: Parent/child links forming tree structure
- **Content**: Exactly one Message object
- **Representation**: Forest represents each role turn as a node; the path from root to a node is the conversation history

### Message

Three distinct message roles:

1. **User messages**: Human input
2. **Assistant messages**: Model responses (may include tool use requests)
3. **Tool messages**: Results from tool execution

Canonical properties:

- `role`: "user" | "assistant" | "tool"
- `content`: Non-empty array of ContentBlock (see below). Empty arrays are not allowed
- `tool_call_id` (tool messages only): Reference to the tool-use block `id` that prompted this result

### ContentBlock

Canonical message content is an ordered list of content blocks:

- `text` block: plain textual content
- `tool-use` block (assistant messages only): a request by the model to execute a named tool with JSON parameters. The `id` correlates to a subsequent tool message's `tool_call_id`.

Additional block types may be introduced (e.g., images, citations). The system must not assume only two types exist.

### Legacy Compatibility (forward-migration only)

Older data formats represented messages as:

- `content: string | null`
- `tool_calls: ToolCall[]` on assistant messages

FileSystemStore MUST normalize legacy-on-disk messages to the canonical form on read:

- Non-empty `content` becomes a single `{ type: 'text', text }` block
- Each legacy `tool_calls[]` entry becomes a `{ type: 'tool-use', id, name, parameters }` block
- Tool messages keep `tool_call_id` as-is and their string content becomes a single text block

On write, FileSystemStore persists only the canonical `content: ContentBlock[]` form (no `tool_calls`, no string `content`).

### NodeMetadata

Optional structured data attached to nodes:

- **source_info**: Provider, model, generation parameters
- **title**: Optional user-authored title for this node (stable once set)
- **auto_title**: Optional machine-generated title (ignored once the node has children or a manual `title`)
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

### Design Rationale: Root Immutability

**Why immutable roots**: Preserves conversation integrity and history
**Benefits**:

- Audit trail - system prompt changes are trackable
- Experimentation - different system prompts create different roots
- Consistency - conversations always retain their original context
  **Trade-offs**: More roots to manage, but enables better prompt engineering

### Path Traversal

- **Deterministic paths**: Path from root to any node is unique
- **Node reuse**: Prefix matching reuses existing child nodes with identical message (role, content, tool calls) under the same parent. Nodes are not shared across different parents/roots
- **Prefix matching**: Navigation follows longest common prefix principle

### Design Rationale: Prefix Matching

**Why prefix matching**: This core optimization enables efficient reuse of existing conversation branches
**Benefits**:

- Memory efficiency - avoids duplicating identical message sequences
- Natural branching - exploration of alternatives shares common context
- User experience - seamless navigation between conversation variants
  **Trade-offs**: Complexity in tree management, but worth it for branching UX

## Message Semantics (V2)

### Content Handling

- **Block lists**: Message `content` is a non-empty array of blocks
- **Assistant without text**: Assistant messages may contain only `tool-use` blocks (no text blocks)
- **Coalescing behavior**: See errors-and-invariants.md for Message Coalescing rules
- **Tool correlation**: Assistant `tool-use` blocks are followed by corresponding tool result messages that reference `tool_call_id`

### Message Equality

Messages considered equal when:

- Same role
- Same content block sequence with deep equality (order and block payloads match)
- Tool results match by `tool_call_id` (for tool messages)

### Message Ordering

- **Conversation flow**: User → Assistant → Tool (if applicable) → Assistant (continuation)
- **Tool-use batching**: Multiple `tool-use` blocks may appear in a single assistant message
- **Result correlation**: Tool results reference specific `tool_call_id`

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

## Editing Semantics (V2)

### LCP (Longest Common Prefix)

The editing process:

1. Compare new message sequence with existing path
2. Identify longest common prefix
3. Split existing path at divergence point
4. Attach new content as branch

### Split Behavior (text-only)

When splitting existing conversation:

- **New branch creation**: Divergent content becomes new branch
- **Parent preservation**: Common prefix remains unchanged
- **Tool message restriction**: Tool messages cannot be split (operation fails for role 'tool')
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
