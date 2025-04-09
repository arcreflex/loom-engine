**Project: `loom-cli` Implementation Plan**

**Goal:** Create a new package `loom-cli` within the `loom-engine` monorepo that provides an interactive command-line interface (REPL) for chatting with language models, leveraging the `@loom/engine` package for conversation tree management and persistence.

**Phase 1: Setup and Initialization**

1.  **Create Package Structure:**
    *   In the `loom-engine/packages/` directory, create a new folder `loom-cli`.
    *   Inside `loom-cli`, create:
        *   `package.json`
        *   `tsconfig.json`
        *   `src/` directory
        *   `README.md` (basic placeholder)

2.  **Configure `package.json`:**
    *   Set `"name": "@loom/cli"`, `"version": "0.1.0"`.
    *   Add `"type": "module"`.
    *   Define `"main": "dist/index.js"` (or `cli.js`).
    *   Add a `"bin"` entry: `"bin": { "loom": "dist/cli.js" }`.
    *   Add dependencies:
        *   `"@loom/engine": "workspace:*"`
        *   `yargs`: For CLI argument parsing.
        *   `inquirer`: For interactive prompts (sibling selection).
        *   `chalk`: For colored console output.
        *   `ora`: (Optional) For spinners during generation.
    *   Add devDependencies:
        *   `typescript`
        *   `@types/node`
        *   `@types/yargs`
        *   `@types/inquirer`
        *   (Ensure these align with the root versions if possible)

3.  **Configure `tsconfig.json`:**
    *   Extend the root `tsconfig.json`: `{ "extends": "../../tsconfig.json", ... }`
    *   Set `compilerOptions`:
        *   `"outDir": "dist"`
        *   `"rootDir": "src"`
    *   Include source files: `"include": ["src/**/*"]`.

4.  **Install Dependencies:**
    *   Run `pnpm install` from the *root* of the `loom-engine` project to install dependencies for the new package and link the workspace dependency.

5.  **Create Entry Point (`src/cli.ts`):**
    *   Add the shebang: `#!/usr/bin/env node`.
    *   Import necessary modules: `LoomEngine` from `@loom/engine`, `yargs`, `path`, `fs/promises`, `os`, `chalk`, and the yet-to-be-created `startRepl` function.
    *   Implement `resolveDataDir(dataDir)` utility function (expands `~` using `os.homedir()`).
    *   Implement `parseModelString(modelString)` utility function (splits "provider/model", returns `{ provider, model }` or throws error).
    *   Implement `loadCurrentNodeId(dataDir)` and `saveCurrentNodeId(dataDir, nodeId)` using `fs.promises.readFile/writeFile` (handle file not found for loading). Store the node ID in `<dataDir>/current-node-id`.

6.  **Implement Argument Parsing & Initialization Logic in `src/cli.ts`:**
    *   Use `yargs(hideBin(process.argv))` to define options:
        *   `--data-dir` (string, default: `~/.loom`)
        *   `--model` (string, description: "Model ID (e.g., anthropic/claude-3-opus-20240229)")
        *   `--system` (string, description: "System prompt for new conversations")
        *   `--n` (number, default: 5, description: "Default number of completions")
        *   `--temp` (number, default: 0.7, description: "Default temperature")
        *   `--max-tokens` (number, default: 1024, description: "Default max tokens")
        *   Use `.help()` and `.alias('h', 'help')`.
        *   Use `.parseAsync()`.
    *   Inside an `async` main function:
        *   Resolve the final `dataDir`.
        *   Ensure `dataDir` exists (`await fs.promises.mkdir(dataDir, { recursive: true })`).
        *   Instantiate `const engine = new LoomEngine(dataDir);`.
        *   Load the last `currentNodeId` using `loadCurrentNodeId`.
        *   **Determine Starting Node Logic:**
            *   Get `cliOptions` from parsed args.
            *   If `cliOptions.model` or `cliOptions.system` is provided:
                *   Parse `cliOptions.model` using `parseModelString`. Create `targetRootConfig` (providerType, model, systemPrompt from args).
                *   Try to load the current node (`persistedNodeId`) and its root config (`engine.getMessages`).
                *   If `targetRootConfig` differs significantly (JSON.stringify comparison?) from the loaded node's root config, OR if no `persistedNodeId` exists:
                    *   `const root = await engine.getForest().getOrCreateRoot(targetRootConfig);`
                    *   Set `startingNodeId = root.id;`
                *   Else (configs match or only system prompt differs slightly - maybe just warn?), use `persistedNodeId`.
            *   Else (no model/system args):
                *   If `persistedNodeId` exists, use it as `startingNodeId`.
                *   Else, print an error (use `chalk.red`) instructing the user to provide `--model` and `--system` for the first run, and `process.exit(1)`.
        *   Save the determined `startingNodeId` using `saveCurrentNodeId`.
        *   Call `await startRepl(engine, startingNodeId, cliOptions);` (pass parsed options for defaults like n, temp, etc.).
        *   Wrap the main logic in a `try...catch` block for fatal errors.

**Phase 2: REPL Implementation**

1.  **Create REPL Module (`src/repl.ts`):**
    *   Import `readline`, `chalk`, and the yet-to-be-created `handleCommand` and `displayContext`.
    *   Export `async function startRepl(engine, initialNodeId, options)`.
    *   Inside `startRepl`:
        *   Initialize `let currentNodeId = initialNodeId;`.
        *   Create `readline.createInterface`.
        *   Define the main recursive `async function loop()`.
        *   Inside `loop`:
            *   Call `await displayContext(engine, currentNodeId);` to show recent history.
            *   Use `rl.question(chalk.blue('> '), async (input) => { ... });` to get user input.
            *   Inside the question callback:
                *   Trim `input`.
                *   If `input` starts with `/`:
                    *   `currentNodeId = await handleCommand(input, engine, currentNodeId, options);`
                *   Else (user message):
                    *   If `input` is empty, just call `loop()` again.
                    *   `const userNode = await engine.getForest().append(...)` for the user message.
                    *   `currentNodeId = userNode.id;`
                    *   // Immediately trigger default generation
                    *   console.log(chalk.yellow('Generating response...')); // Or use ora
                    *   `currentNodeId = await handleCommand('/', engine, currentNodeId, options);` // Simulate '/' command
                *   Call `await saveCurrentNodeId(options.dataDir, currentNodeId);` // Save after every potential change
                *   Call `loop();` to continue the REPL.
        *   Call `loop()` initially to start the REPL.
        *   Set up listener for `rl.on('close', () => { process.exit(0); });` (e.g., for Ctrl+D). Handle `SIGINT` (Ctrl+C) gracefully.

**Phase 3: Command Handling**

1.  **Create Command Handler Module (`src/commands.ts`):**
    *   Import `LoomEngine`, types, `inquirer`, `chalk`, `ora`, `displayContext`, and bookmark/state helpers.
    *   Export `async function handleCommand(input, engine, currentNodeId, options)` which *returns the new `currentNodeId`*.
    *   Parse the command and arguments from `input` (e.g., `const [command, ...args] = input.slice(1).split(' ');`).
    *   Use a `switch (command)` or `if/else if` structure:
        *   **`case '': case 'N' (numeric):`** (`/` or `/N`)
            *   Parse `N` (default to `options.n`).
            *   Start spinner (`ora`).
            *   `try...catch` block for `engine.generate`.
            *   Fetch context: `const { root, messages } = await engine.getMessages(currentNodeId);`.
            *   Call `const assistantNodes = await engine.generate(...)` using `root`, `messages`, `N`, `options.temp`, `options.maxTokens`.
            *   Stop spinner.
            *   If `assistantNodes.length > 0`:
                *   Display generated messages (maybe numbered).
                *   **Simple Approach:** Select `const chosenNode = assistantNodes[0];`.
                *   Display the chosen response content clearly.
                *   Return `chosenNode.id`.
            *   Else (no responses):
                *   Display message "No responses generated."
                *   Return `currentNodeId` (no change).
            *   In `catch`: Stop spinner, display error (`chalk.red`), return `currentNodeId`.
        *   **`case 'siblings':`**
            *   Get current node and parent. Handle errors (no parent).
            *   Get children from parent. Filter out `currentNodeId`.
            *   Format choices for `inquirer` (e.g., `[{ name: \`[${index}] ${sibling.message.content.substring(0, 50)}...\`, value: sibling.id }, ...]`).
            *   Use `inquirer.prompt([{ type: 'list', name: 'selectedId', message: 'Choose sibling:', choices }])`.
            *   If a selection is made (`answers.selectedId`), return `answers.selectedId`.
            *   Else (cancelled or error), return `currentNodeId`.
        *   **`case 'parent':`**
            *   Get current node.
            *   If `node && node.parent_id`, display message "Moving to parent." and return `node.parent_id`.
            *   Else, display error "Already at root or node not found." and return `currentNodeId`.
        *   **`case 'save':`**
            *   Implement `loadBookmarks(dataDir)` and `saveBookmarks(dataDir, bookmarks)` using `fs/promises` and JSON.
            *   Get `title` from `args.join(' ')`. Check if title is provided.
            *   Load bookmarks. Add `bookmarks[title] = currentNodeId;`. Save bookmarks.
            *   Display confirmation. Return `currentNodeId`.
        *   **`case 'context':`** (Optional)
            *   Call `await displayContext(engine, currentNodeId, options.contextLines || 15);` // Add a context line option?
            *   Return `currentNodeId`.
        *   **`case 'exit':`**
            *   Call `process.exit(0);`.
        *   **`default:`**
            *   Display error "Unknown command:" + command. Return `currentNodeId`.

**Phase 4: Display and Polish**

1.  **Create Display Module (`src/display.ts`):**
    *   Import `chalk`.
    *   Export `async function displayContext(engine, nodeId, historyCount = 10)`.
    *   Fetch messages using `engine.getMessages(nodeId)`. Handle errors.
    *   Slice the last `historyCount` messages.
    *   Iterate and print messages using `chalk` for roles:
        *   `system`: `chalk.magenta`
        *   `user`: `chalk.green`
        *   `assistant`: `chalk.cyan`
        *   `tool`: `chalk.yellow`
    *   Clearly delineate the history output (e.g., lines before/after).

2.  **Refine Output:**
    *   Use `chalk` consistently for user prompts, errors, confirmations, and generated output.
    *   Ensure clear visual separation between turns in the REPL.

3.  **Error Handling:**
    *   Add specific `try...catch` blocks around file I/O and engine calls within commands.
    *   Provide user-friendly error messages.

4.  **README (`packages/loom-cli/README.md`):**
    *   Document installation (`pnpm add -g @loom/cli` after publishing, or `pnpm link --global` for development).
    *   Explain all CLI options (`--data-dir`, `--model`, etc.).
    *   Document available `/` commands.
    *   Explain the state file (`current-node-id`) and bookmarks (`bookmarks.json`).
    *   Mention environment variables for API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).

**Phase 5: Testing (Manual)**

1.  Build the CLI: `pnpm --filter @loom/cli build`.
2.  Link for global use: `pnpm link --global` (from the `loom-engine` root).
3.  Run `loom --help`.
4.  Start a new session: `loom --model anthropic/claude-3-haiku-20240307 --system "You are concise."`
5.  Enter messages, use `/`, `/5`, `/siblings`, `/parent`, `/save`.
6.  Exit (Ctrl+C or Ctrl+D) and restart `loom` without args to test persistence.
7.  Test error conditions (unknown command, invalid model string, starting without existing state/args).

This plan breaks the implementation into manageable steps, focusing on core functionality first and then adding specific commands and polish.