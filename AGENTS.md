# AGENTS ORIENTATION

Welcome, fellow coding agents! This document is a **machine-to-machine quick-start** for the
`loom-engine` monorepo.  It is intentionally terse, link-free, and script-friendly so that
automated agents (and humans that behave like them) can get productive in minutes.

---

## 1. High-level Picture

* **Purpose** – A TypeScript toolkit for storing and navigating branching LLM
  conversations (**`@ankhdt/loom-engine`**) plus an optional web GUI
  (**`@ankhdt/loom-gui`**).
* **Workspace** – PNPM monorepo (`pnpm-workspace.yaml`).  Every package follows
  `type: "module"` and ESBuild / Vite pipelines.
* **Runtime** – Node ≥ 20 (ESM, `node --test`).  No CommonJS.

Package overview:

| Package | NPM name | Description |
|---------|----------|-------------|
| `packages/engine` | `@ankhdt/loom-engine` | Pure TS library (conversation tree = *Forest*, file-system persistence, provider adapters for Anthropic / OpenAI / Google). |
| `packages/gui` | `@ankhdt/loom-gui` | React + Tailwind SPA served by an Express backend that wraps the engine. |

---

## 2. Cloning & Bootstrapping

```bash
git clone <repo>
cd loom-engine   # workspace root
pnpm install     # installs for all packages
```

Node versions earlier than 20 will fail on `node --test` and top-level `await`.

---

## 3. Daily Driver Commands (root-level)

| Task | Command |
|------|---------|
| Run all tests | `pnpm test` |
| Lint (ESLint) | `pnpm lint` |
| Format (Prettier) | `pnpm format` |
| Type-check | `pnpm typecheck` |
| Build everything | `pnpm build` |
| Start the GUI (dev) | `pnpm start:gui` *(declared via `package.json` → concurrently frontend & backend)* |
| Workspace-level run | `pnpm -w <script>` *(executes a script in every package)* |

Per-package script:

```bash
# example: only re-run engine tests
pnpm --filter @ankhdt/loom-engine test
```

GUI-only scripts (run inside `packages/gui`):

```bash
pnpm dev            # front- & back-end concurrently
pnpm dev:frontend   # Vite only
pnpm dev:backend    # Express-TSX watcher only
```

---

## 4. Directory Cheatsheet

```
packages/
  engine/
    src/
      engine.ts        # LoomEngine – orchestration & provider dispatch
      forest.ts        # Forest – core tree logic (get/append, paths, etc.)
      store/
        file-system-store.ts  # default persistence (JSON on disk)
      providers/       # OpenAI, Anthropic, Google adapters
      config.ts        # ~/.loom/config.toml parser & env injection
      types.ts         # Nominal-typed aliases (NodeId, RootId, …)
  gui/
    src/
      server.ts        # Express REST wrapper around LoomEngine
      */*.tsx          # React UI
```

`migrate.cjs` – one-off script for migrating legacy data folders into the
current on-disk schema.

---

## 5. Data & Configuration

* All user data lives *outside* the repo, defaulting to `~/.loom`.
* Override location with env var: `DATA_DIR=/absolute/path pnpm <script>`.
* Key file: `~/.loom/config.toml`.  The library creates a stub if it is
  missing.  Fields of interest:

  ```toml
  [providers.openai]
  apiKey   = "sk-…"   # becomes OPENAI_API_KEY if not already set
  baseURL  = "https://api.openai.com/v1"

  [defaults]
  model        = "openai/gpt-4o"
  temperature  = 1.0
  maxTokens    = 1024
  n            = 5
  systemPrompt = "You are a helpful assistant."
  ```

The `ConfigStore` (see `packages/engine/src/config.ts`) automatically promotes
`apiKey` values to environment variables (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) at runtime.

---

## 6. Tests

* Located next to source (`*.test.ts`).
* Node’s experimental test runner (`node --test`).
* CI and the local pre-commit hook run **tests + typecheck + lint**; commits
  that fail will be rejected.  Agents should ensure the following passes **before**
  invoking `git commit`:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## 7. Code Style

* ESLint rules live in `eslint.config.js` (typescript-eslint + react hooks).
* Prettier config is embedded in root `package.json`.
* Strict TypeScript (no implicit any, etc.).  Nominal typing is achieved via
  branded string literals (e.g. `type NodeId = string & { __brand: 'NodeId' }`).

Agents: please preserve existing style; run `pnpm format` after large edits.

---

## 7.5  Testing Philosophy (Why tests fail)

* Failing tests generally indicate a real issue—**fix the code, not the test**.
* Adding a new feature?  First add or update tests in *the same package* (tests live next to source as `*.test.ts`).

---

---

## 8. Provider Adapters

Adapter classes implement a minimal interface:

```
generate({
  systemMessage,
  messages,        // user/assistant turn array
  model,
  parameters       // {max_tokens, temperature, ...}
}) => { message, finish_reason, usage }
```

Current implementations:

* `OpenAIProvider`  (`openai` NPM SDK)
* `AnthropicProvider`  (`@anthropic-ai/sdk`)
* `GoogleProvider`  (`@google/genai`)

Adding a new provider typically requires:

1. Create `packages/engine/src/providers/<name>.ts` implementing the interface.
2. Extend the union type `ProviderName` (see `types.ts`).
3. Register the provider in `LoomEngine#getProvider`.

---

## 9. Common Pitfalls

1. **Stale builds between packages** – GUI depends on a built version of the
   engine.  After changing code in `packages/engine` run **`pnpm build`** before
   any GUI dev script.  Significant API changes typically require corresponding
   updates in `packages/gui`.
2. **Node vs. Browser** – `@ankhdt/loom-engine` exposes a `/browser` entry
   point with zero Node-specific deps.  Use this in client-side bundles to avoid
   pulling in `fs`.
3. **Data directory collisions** – Tests create temporary stores under `os.tmpdir()`;
   do **not** point `$DATA_DIR` to a shared production folder when running
   tests in parallel.
4. **GUI backend not running** – If you use `pnpm dev` inside `packages/gui`
   or individual `dev:*` scripts, remember that the React frontend expects the
   Express server (`dev:backend`) to be available (default http://localhost:3001).

---

## 10. Contribution Protocol for Automated Agents

1. Fork or create a branch.
   * Naming convention: `feat/<subject>` or `fix/<bug>`.  Keep scope tight.
2. Modify code **and** matching tests.
3. Ensure `pnpm lint`, `pnpm typecheck`, `pnpm test`, and (if GUI touched)
   `pnpm --filter @ankhdt/loom-gui build` succeed.
4. Keep diffs focused.  Unrelated style or formatting changes should be
   avoided to reduce merge friction.
5. Human-readable commit message format: `feat(component): short summary`.

---

Happy weaving!
