#### Plan for Building `loom-engine` TypeScript Library

**Goal:** Create a TypeScript library (`loom-engine`) for managing interactions with language models based on the "loom of time" concept. It should support branching conversations, different LLM providers, persistent storage, node splitting, and tree cloning. The project should be set up as a package within a pnpm monorepo, using standard TypeScript, ESLint, and Prettier configurations.

**Core Concepts:**
*   **Loom:** A collection (forest) of interaction trees.
*   **Root:** The starting point of a tree, defined by a specific provider, model, and parameters.
*   **Node:** Represents a point in the interaction history, containing one or more messages and links to parent/children.
*   **Path:** The sequence of nodes from the root to a specific node defines the context.
*   **Branching:** Creating multiple child nodes from a single parent.
*   **Prefix Matching:** When appending messages, reuse existing child nodes that share the same initial message(s).
*   **Storage:** Persist loom data to the filesystem (directory per root, JSON file per node).

**Tech Stack:**
*   TypeScript
*   Node.js
*   pnpm (for monorepo management)
*   ESLint (default configuration)
*   Prettier (default configuration)
*   Husky + lint-staged (for pre-commit hooks)
*   uuid (for generating unique IDs)
*   SDKs: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`

---

**Phase 1: Project Setup & Core Types**

1.  **Monorepo Setup:**
    *   Initialize a new project directory.
    *   Initialize pnpm: `pnpm init`
    *   Create a `pnpm-workspace.yaml` file defining the packages path (e.g., `packages/*`).
    *   Create the package directory: `mkdir packages/loom-engine`
    *   Navigate into the package: `cd packages/loom-engine`
    *   Initialize the package: `pnpm init` (fill in details like name: `@your-scope/loom-engine`, entry point: `dist/index.js`, types: `dist/index.d.ts`).
    *   Install base dependencies: `pnpm add -D typescript @types/node @types/uuid`
    *   Install UUID library: `pnpm add uuid`
    *   Setup TypeScript: Create `tsconfig.json` (target ES2020 or later, module NodeNext, declaration true, outDir ./dist, rootDir ./src, strict mode recommended).
    *   Create `src` directory: `mkdir src`

2.  **Linting & Formatting Setup:**
    *   Go to the *root* of the monorepo.
    *   Install dev dependencies: `pnpm add -D -w eslint prettier eslint-config-prettier eslint-plugin-prettier husky lint-staged`
    *   Configure ESLint: Create `.eslintrc.js` (use recommended settings, integrate Prettier).
    *   Configure Prettier: Create `.prettierrc.js` (use default settings or define your preferences). Add `.prettierignore`.
    *   Setup Husky: `pnpm exec husky init` (this might need `npx husky init` if pnpm exec doesn't work directly).
    *   Setup lint-staged: Configure in `package.json` or a `.lintstagedrc.js` file to run `eslint --fix` and `prettier --write` on staged files.
    *   Add npm scripts to the *root* `package.json` for linting/formatting the workspace: `lint`, `format`.
    *   Add npm scripts to the `loom-engine/package.json`: `build` (`tsc`), `dev` (`tsc -w`), `lint`, `format`.

3.  **Define Core Types (`packages/loom-engine/src/types/`):**
    *   **`common.ts`:**
        *   `export type NodeId = string;`
        *   `export type RootId = string;`
    *   **`message.ts`:**
        *   `export type Role = 'system' | 'user' | 'assistant' | 'tool'; // Align with common provider roles`
        *   `export interface Message { role: Role; content: string; // Potentially add tool_call_id, tool_calls later if needed }`
    *   **`config.ts`:**
        *   `export type ProviderType = 'openai' | 'anthropic' | 'gemini';`
        *   `export interface RootConfig { providerType: ProviderType; model: string; // e.g., 'gpt-4', 'claude-3-opus-20240229' parameters: Record<string, any>; // e.g., { temperature: 0.7, max_tokens: 100 } systemPrompt?: string; // Optional initial system prompt }`
        *   `export interface RootInfo extends RootConfig { rootId: RootId; createdAt: string; // ISO 8601 timestamp }`
    *   **`node.ts`:**
        *   `import { NodeId, RootId } from './common';`
        *   `import { Message } from './message';`
        *   `export interface NodeMetadata { timestamp: string; // ISO 8601 creation timestamp original_root_id: RootId; // The root ID when the node was first created provider_request_params?: Record<string, any>; // Params used if node resulted from LLM call provider_response_info?: { finish_reason?: string | null; usage?: { input_tokens?: number; output_tokens?: number; }; }; tags?: string[]; custom_data?: Record<string, any>; }`
        *   `export interface NodeData { uuid: NodeId; root_id: RootId; // The *current* tree this node belongs to parent_uuid: NodeId | null; child_uuids: NodeId[]; messages: Message[]; // One or more messages metadata: NodeMetadata; }`

---

**Phase 2: Storage Layer**

1.  **Define Storage Interface (`packages/loom-engine/src/store/ILoomStore.ts`):**
    *   `import { NodeData, NodeId, RootId, RootInfo } from '../types';`
    *   `export interface NodeQueryCriteria { parentId?: NodeId; rootId?: RootId; }`
    *   `export interface ILoomStore { initialize(basePath: string): Promise<void>; saveNode(nodeData: NodeData): Promise<void>; loadNode(nodeId: NodeId): Promise<NodeData | null>; deleteNode(nodeId: NodeId): Promise<void>; // Consider if deletion is needed, or just detachment findNodes(criteria: NodeQueryCriteria): Promise<NodeData[]>; saveRootInfo(rootInfo: RootInfo): Promise<void>; loadRootInfo(rootId: RootId): Promise<RootInfo | null>; listRootInfos(): Promise<RootInfo[]>; }`

2.  **Implement Filesystem Storage (`packages/loom-engine/src/store/FileSystemLoomStore.ts`):**
    *   Implement the `ILoomStore` interface.
    *   Use Node.js `fs/promises` for async file operations.
    *   Use the `uuid` library (e.g., `v4()`) to generate `NodeId`s if not provided.
    *   **Structure:**
        *   `basePath`: The root directory provided during initialization.
        *   `basePath/roots.json`: A JSON file storing an array of `RootInfo` objects.
        *   `basePath/<rootId>/`: Directory for each tree.
        *   `basePath/<rootId>/nodes/`: Directory containing node files.
        *   `basePath/<rootId>/nodes/<nodeId>.json`: JSON file storing `NodeData` for a single node.
    *   **Methods:**
        *   `initialize`: Ensure `basePath` exists. Load `roots.json` if it exists.
        *   `saveNode`: Write/overwrite `<nodeId>.json` in the correct `rootId` directory. Ensure node directory exists.
        *   `loadNode`: Read and parse `<nodeId>.json`. Handle file not found (return `null`). Handle JSON parse errors.
        *   `deleteNode`: Delete the node JSON file. (Consider implications: need to update parent's `child_uuids`? This might be better handled in the Engine layer).
        *   `findNodes`: This is tricky with pure files.
            *   If `rootId` is provided: List files in `basePath/<rootId>/nodes/`, load them, and filter by `parentId` if needed.
            *   If only `parentId` is provided: This is inefficient; avoid if possible, or require `rootId`.
        *   `saveRootInfo`: Read `roots.json`, update/add the entry, write back. Use locking or careful read-modify-write if concurrency is a concern (unlikely for typical library use).
        *   `loadRootInfo`: Read `roots.json`, find by `rootId`.
        *   `listRootInfos`: Read and return the contents of `roots.json`.
    *   **Error Handling:** Implement robust error handling for file system operations and JSON parsing.

---

**Phase 3: Provider Abstraction Layer**

1.  **Define Provider Types (`packages/loom-engine/src/providers/types.ts`):**
    *   `import { Message, Role } from '../types';`
    *   `export interface ProviderRequest { messages: Message[]; // Full context history modelConfig: Record<string, any>; // Contains model name, temp, max_tokens etc. stream?: boolean; // Optional: Add later if streaming is needed }`
    *   `export interface ProviderResponse { message: Message; // The generated message (role typically 'assistant') usage?: { input_tokens?: number; output_tokens?: number; }; finish_reason?: string | null; rawResponse?: any; // Optional: Include the raw provider response for debugging/extensions }`
    *   `export interface IProvider { generate(request: ProviderRequest): Promise<ProviderResponse>; }`

2.  **Implement Provider Adapters (`packages/loom-engine/src/providers/`):**
    *   Install SDKs: `pnpm add openai @anthropic-ai/sdk @google/generative-ai`
    *   Create adapter classes, one for each provider (`OpenAIProvider.ts`, `AnthropicProvider.ts`, `GeminiProvider.ts`).
    *   Each class should implement `IProvider`.
    *   **Constructor:** Accept necessary configuration (API key, potentially base URL for OpenAI). API keys should ideally be handled via environment variables or passed securely, not hardcoded.
    *   **`generate` Method:**
        *   Map the abstract `ProviderRequest` (especially `messages`) to the specific format required by the provider's SDK. Pay attention to role mapping (e.g., Gemini might have different role names). Handle system prompts correctly.
        *   Call the appropriate SDK function (e.g., `openai.chat.completions.create`, `anthropic.messages.create`, `gemini.getGenerativeModel(...).generateContent`).
        *   Map the provider's response back to the abstract `ProviderResponse` structure. Extract content, role, usage data, and finish reason.
        *   Include error handling for API calls.

---

**Phase 4: Loom Engine Core**

1.  **Implement Loom Engine Class (`packages/loom-engine/src/LoomEngine.ts`):**
    *   `import { ILoomStore, FileSystemLoomStore } from './store';`
    *   `import { IProvider } from './providers/types';`
    *   `import { NodeData, NodeId, RootId, RootConfig, Message, RootInfo } from './types';`
    *   `import { v4 as uuidv4 } from 'uuid';`
    *   **Constructor:**
        *   Accept `rootDirectory` string or an `ILoomStore` instance (dependency injection is preferred).
        *   Accept a map or factory function to get `IProvider` instances based on `ProviderType` and config (including API keys).
        *   Initialize the store (`this.store.initialize(...)`).
    *   **Core Methods:**
        *   `createRoot(config: RootConfig): Promise<NodeData>`: Create `RootInfo`, save it. Create the initial root `NodeData` (no parent, empty messages or system prompt only, generate UUID, set `original_root_id`= `rootId`). Save the root node. Return the root node data.
        *   `getRootInfo(rootId: RootId): Promise<RootInfo | null>`: Load from store.
        *   `listRoots(): Promise<RootInfo[]>`: Load from store.
        *   `getNode(nodeId: NodeId): Promise<NodeData | null>`: Load from store.
        *   `getMessages(nodeId: NodeId): Promise<Message[]>`:
            *   Start at `nodeId`. Load the node.
            *   Traverse up via `parent_uuid` until the root (`parent_uuid === null`) is reached, collecting nodes along the way.
            *   Reverse the collected nodes.
            *   Concatenate the `messages` arrays from the nodes in the correct order (root to `nodeId`). Return the combined list. Handle errors (node not found during traversal).
        *   `getChildren(nodeId: NodeId): Promise<NodeData[]>`: Load the node, then use `store.findNodes({ parentId: nodeId, rootId: nodeData.root_id })`.
        *   `append(parentId: NodeId, messages: Message[]): Promise<NodeData>`:
            *   **Prefix Matching:**
                *   Load the parent node (`parentNode`).
                *   Get its children using `getChildren(parentId)`.
                *   Iterate through the input `messages` one by one. At each step, check if any child node *starts* with the current message being processed.
                *   If a match is found, "descend" into that child node and continue matching the *rest* of the input `messages` against *its* children.
                *   If no matching child is found at any step, or if a child matches only *part* of its message list, create a new node for the remaining unmatched messages. This new node's parent will be the last successfully matched node (or the original `parentId`).
            *   **Node Creation:** Create `NodeData` for the new segment (generate UUID, link `parent_uuid`, set `messages`, copy `root_id`, set `original_root_id`, create metadata).
            *   Save the new node using `store.saveNode`.
            *   Update the parent node's `child_uuids` list and save the parent node.
            *   Return the *final* node created or matched in the sequence.
        *   `generateNext(nodeId: NodeId, userPrompt: string | Message): Promise<NodeData>`:
            *   Get the message history using `getMessages(nodeId)`.
            *   Append the `userPrompt` (convert string to `{role: 'user', content: userPrompt}`) to the history.
            *   Load the node `nodeId` to get its `root_id`. Load the `RootInfo` for that `root_id`.
            *   Get the appropriate `IProvider` instance based on `RootInfo.providerType`.
            *   Prepare the `ProviderRequest` using the message history and `RootInfo.parameters`.
            *   Call `provider.generate(request)`.
            *   Use `append(nodeId, [ /* user message */, providerResponse.message ])` to add *both* the user message and the assistant response as a new node sequence. Store response metadata (`usage`, `finish_reason`) in the new assistant node's metadata.
            *   Return the newly created assistant node.
        *   `splitNode(nodeId: NodeId, messageIndex: number): Promise<NodeData>`: (Implement the logic described in our previous discussion: create new node N', modify original node N, update children's parent pointers, save all changes). Return the modified node N.
        *   `cloneTree(sourceRootId: RootId, newRootConfig: RootConfig): Promise<NodeData>`: (Implement the logic described previously: create new root, traverse old tree, create corresponding new nodes with new UUIDs/root_id but preserving `original_root_id`, update parent/child links, save new nodes). Return the new root node.

---

**Phase 5: Testing & Documentation**

1.  **Testing:**
    *   Set up a testing framework (Jest or Vitest recommended): `pnpm add -D jest @types/jest ts-jest` or `pnpm add -D vitest @vitest/coverage-v8`. Configure it to work with TypeScript.
    *   **Unit Tests:**
        *   Test `FileSystemLoomStore` (mock `fs/promises`).
        *   Test Provider adapters (mock the actual SDK calls).
        *   Test `LoomEngine` logic (using a mock `ILoomStore` and mock `IProvider`). Test `getMessages`, `append` (with prefix matching cases), `splitNode`, `cloneTree`, `generateNext`.
    *   **Integration Tests:**
        *   Test `FileSystemLoomStore` against the actual filesystem (in a temporary directory).
        *   Test `LoomEngine` using `FileSystemLoomStore` (but potentially still mocking providers to avoid actual API costs/latency during tests).

2.  **Documentation:**
    *   Write TSDoc comments for all public classes, methods, interfaces, and types.
    *   Create a comprehensive `README.md` in `packages/loom-engine/` explaining the library's purpose, concepts, installation, and usage with examples.
    *   Consider generating API documentation from TSDoc comments (e.g., using TypeDoc).

---

**Instructions for Claude Code:**

*   Implement the plan step-by-step, focusing on one phase at a time.
*   Generate TypeScript code adhering to the defined interfaces and file structure.
*   Use async/await for all asynchronous operations (storage, provider calls).
*   Include basic error handling (e.g., try/catch blocks for I/O and API calls).
*   Generate TSDoc comments for public APIs.
*   Ensure ESLint and Prettier configurations are applied correctly.
*   Start with Phase 1 (Setup & Types) before moving to implementation details.
