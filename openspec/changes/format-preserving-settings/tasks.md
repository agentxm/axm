> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Add `jsonc-parser` dependency

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Install `jsonc-parser` in `packages/cli` (`pnpm add jsonc-parser` in `packages/cli/`)
- [ ] 1.2 Verify `pnpm typecheck` passes
- [ ] 1.3 Verify `pnpm lint` passes
- [ ] 1.4 Verify `pnpm test` passes
- [ ] 1.5 Verify `pnpm test:e2e` passes
- [ ] 1.6 Kill any vitest worker processes

## 2. Implement `detectFormatting` and `modifyJsonFile`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Write tests for `detectFormatting` — detect tab vs spaces, tab size, eol (`\n` vs `\r\n`), fallback to defaults (2-space, `\n`) for empty/minimal files
- [ ] 2.2 Implement `detectFormatting(text: string) → FormattingOptions` in `packages/cli/src/settings/format-preserving-json.ts` — heuristic: scan first indented line for indent char/size, scan for `\r\n` vs `\n`
- [ ] 2.3 Verify `pnpm typecheck` passes, fix any issues
- [ ] 2.4 Write tests for `modifyJsonFile` covering: edit property in tab-indented file, edit in 4-space-indented file, trailing newline preserved, no trailing newline preserved, insert matches existing style (tab, 4-space, CRLF), multiple edits in single call, remove property via `undefined`, remove last property from parent object
- [ ] 2.5 Implement `modifyJsonFile(filePath, modifications) → Effect<void, SettingsWriteError>` — read raw text, call `detectFormatting`, loop `modify()` per modification accumulating edits, `applyEdits`, write back
- [ ] 2.6 Verify `pnpm typecheck` passes, fix any issues
- [ ] 2.7 Verify `pnpm lint` passes, fix any issues
- [ ] 2.8 Verify `pnpm test` passes, fix any failures
- [ ] 2.9 Verify `pnpm test:e2e` passes, fix any failures
- [ ] 2.10 Kill any vitest worker processes

## 3. Update `writeSettings` to add trailing newline

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (can run in parallel with Phase 2)

- [ ] 3.1 Update test for `writeSettings` — expect trailing `\n` after `JSON.stringify` output
- [ ] 3.2 Update `writeSettings` in `packages/cli/src/settings/settings.ts` to append `\n` to the serialized content
- [ ] 3.3 Update auto-create in `SettingsService` (`readOrCreate`) to write `{}\n` instead of `{}`
- [ ] 3.4 Update any tests that assert exact file content to expect trailing newline
- [ ] 3.5 Verify `pnpm typecheck` passes, fix any issues
- [ ] 3.6 Verify `pnpm lint` passes, fix any issues
- [ ] 3.7 Verify `pnpm test` passes, fix any failures
- [ ] 3.8 Verify `pnpm test:e2e` passes, fix any failures
- [ ] 3.9 Kill any vitest worker processes

> **Parallelization:** Phases 2 and 3 are independent — launch as parallel subagents.

## 4. Refactor `SettingsService` mutations to use `modifyJsonFile`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2 and 3

- [ ] 4.1 Update `addSkill` tests — verify formatting preservation (write a tab-indented settings file, call `addSkill`, assert non-edit regions are byte-for-byte identical)
- [ ] 4.2 Refactor `addSkill` mutation to use `modifyJsonFile` with path `["skills", name]` and value `source`
- [ ] 4.3 Verify `pnpm typecheck` passes, fix any issues
- [ ] 4.4 Update `removeSkill` tests — verify formatting preservation and property removal via `modifyJsonFile`
- [ ] 4.5 Refactor `removeSkill` mutation to use `modifyJsonFile` with path `["skills", name]` and value `undefined`
- [ ] 4.6 Verify `pnpm typecheck` passes, fix any issues
- [ ] 4.7 Update `addAgent` tests — verify formatting preservation (agents array updated, rest of file untouched)
- [ ] 4.8 Refactor `addAgent` mutation to read current agents via `readSettings`, append new ID, then use `modifyJsonFile` with path `["agents"]` and the updated array
- [ ] 4.9 Verify `pnpm typecheck` passes, fix any issues
- [ ] 4.10 Verify `pnpm lint` passes, fix any issues
- [ ] 4.11 Verify `pnpm test` passes, fix any failures
- [ ] 4.12 Verify `pnpm test:e2e` passes, fix any failures
- [ ] 4.13 Kill any vitest worker processes

## 5. Clean up and export

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [ ] 5.1 Export `modifyJsonFile` and `detectFormatting` from `packages/cli/src/settings/index.ts` barrel
- [ ] 5.2 Remove any now-unused imports or helpers from `settings.ts` and `service.ts` (e.g., if `writeSettings` is no longer called by mutations)
- [ ] 5.3 Verify `pnpm typecheck` passes, fix any issues
- [ ] 5.4 Verify `pnpm lint` passes, fix any issues
- [ ] 5.5 Verify `pnpm test` passes, fix any failures
- [ ] 5.6 Verify `pnpm test:e2e` passes, fix any failures
- [ ] 5.7 Kill any vitest worker processes
