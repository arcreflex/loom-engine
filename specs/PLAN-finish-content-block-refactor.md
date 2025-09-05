# Plan: Finish Content-Block Refactor (V2-First Engine)

Goal: make V2 content blocks the sole message representation throughout the engine, providers, GUI server, and UI. The only remaining legacy surface is inside the file store, which must forward‑migrate legacy messages found on disk to V2 before returning them (and optionally rewrite them on save). The GUI server and frontend are V2-only on both input and output (no string content accepted).

## Objectives

- Replace legacy `Message` usage with `MessageV2` across core APIs.
- Providers receive V2 context and return V2 (already true); remove legacy branches.
- Forest/Engine operate natively on V2 (append/prefix matching/editing).
- GUI server surfaces V2 and requires V2 inputs (no string content accepted by routes).
- FileSystemStore persists V2 (already) and returns V2 (forward‑migrate any legacy-on-disk entries on read).
- Update tests and docs accordingly.

## Non-goals

- No introduction of new block types beyond `text` and `tool-use`.
- No streaming in this phase.
- No provisions for backwards-compatibility other than the FileSystemStore forward-migration already noted above.

## Deliverables

- Types flipped to V2 as the primary shape.
- Engine/Forest APIs updated to V2.
- Store returns V2 and forward‑migrates legacy on read.
- Providers simplified to V2-only inputs.
- GUI server/UI V2-only for requests and responses.
- Tests updated: unit + integration green under `pnpm test`.

## Phases and Tasks

### Phase 0 – Prep

- Inventory legacy surfaces (done in audit).
- Add plan (this file) and create PR checklist.

### Phase 1 – Types Flip

- Update `types.ts`:
  - Promote `MessageV2` to canonical message type.
  - Change `NodeData.message` to `MessageV2`; remove `NodeDataV2` alias by folding it into `NodeData`.
  - Deprecate `Message` (legacy) and helpers like `getToolCalls`. Replace with V2 helpers (`extractToolUseBlocks`).
- Update `providers/types.ts` to accept `messages: MessageV2[]` only.

Acceptance:

- `pnpm typecheck` passes with `MessageV2` everywhere except temporary compatibility adapters.

### Phase 2 – Providers V2-only

- Remove legacy normalization branches in provider adapters.
- Ensure request shaping uses V2 (`normalizeMessagesToV2` no longer needed at call sites; keep internal guards if helpful).

Acceptance:

- Providers compile with `ProviderRequest.messages: MessageV2[]` and unit tests pass.

### Phase 3 – Forest/Engine Core

- Engine (`engine.ts`):
  - `generate` accepts `contextMessages: MessageV2[]`.
  - Remove V2→legacy→V2 conversions; pass V2 directly to providers.
  - Append provider responses as V2 to the forest.
  - Tool results created as V2 tool messages (text blocks only).
- Forest (`forest.ts`):
  - `append(parentId, messages: MessageV2[], …)`.
  - Prefix matching compares V2 via `normalizeForComparison` + `stableDeepEqual`.
  - `getMessages` returns V2.
  - Editing/splitting: operate on text blocks. Limit edits to text-only messages; reject/guard when tool-use present.

Acceptance:

- All engine/forest unit tests updated to V2 and passing.

### Phase 4 – Store (V2 everywhere)

- `FileSystemStore`:
  - Persist V2 (unchanged).
  - Return V2 for `loadNode`, `findNodes`, `listAllNodeStructures` unchanged (structure stays content-free).
  - Forward‑migrate when reading legacy on disk: detect legacy message shape and convert to V2 before returning (optionally rewrite file on save path).
  - Remove `toLegacyNode` and invert `loadNodeNormalized` → `loadNode`.
- Keep a private `isLegacyMessage` guard for migration.

Acceptance:

- Legacy node fixtures are read as V2; writing re-serializes as V2.

### Phase 5 – GUI Server & UI

- API responses already V2; keep.
- Requests: require V2 payloads. Remove string acceptance and any coercion.
  - Update route validators/types to require `ContentBlock[]` (text-only) for user append/edit.
  - Remove `joinTextBlocksOrError` and any string-join branches; keep/introduce block validation helpers to enforce text-only constraint for user messages and reject tool-use blocks on append/edit.
- Update token counting to operate on V2 (use engine-utils helpers or simple char heuristic on JSON of V2 messages).
- UI components already use V2; ensure edit/append paths construct and send V2 payloads.

Acceptance:

- GUI integration tests pass with V2 request/response shapes.

### Phase 6 – Tests & Fixtures

- Migrate engine/forest tests from legacy shapes to V2.
- Update store tests to assert V2 on read/write and forward‑migration behavior.
- Update provider tests accordingly.

Acceptance:

- `pnpm test` green across workspace.

### Phase 7 – Cleanup & Docs

- Remove dead legacy conversion code paths not needed for store migration.
- Update specs (data model, engine, providers) to state V2-only.
- Migration notes: breaking changes summary.

Acceptance:

- Lint/typecheck/test pass; specs updated.

## Risks & Mitigations

- Breaking public API: GUI routes will reject string content (V2-only). Acceptable, because this project is still in early development, has no external consumers.
- Editing semantics with mixed content: constrain edits to text-only messages in this phase.
- Token estimates variance after V2: use existing `estimateInputTokens` utilities.

## Checklist

- [ ] types: `MessageV2` canonical; `NodeData.message: MessageV2`
- [ ] providers: `ProviderRequest.messages: MessageV2[]`
- [ ] engine: V2 inputs/outputs; remove legacy conversion
- [ ] forest: V2 append/prefix/edit
- [ ] store: forward‑migrate legacy on read; return V2
- [ ] gui server/UI: V2-only inputs (no strings); responses V2
- [ ] tests: updated for V2 shapes
- [ ] docs/specs: updated to V2-only
