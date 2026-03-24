# CliError → AppError Rename Plan

## Why

Effect v4's `effect/unstable/cli` exports its own `CliError` — a union of 8 parsing/framework error types. Our application-level `CliError` serves a completely different purpose (structured domain errors with codes, context, and recovery suggestions). The name collision forces aliased imports and creates confusion. Renaming ours to `AppError` eliminates the collision and better describes what it is.

## Naming Map

| Before                                                  | After              |
| ------------------------------------------------------- | ------------------ |
| `CliError` (class)                                      | `AppError`         |
| `makeCliError`                                          | `makeAppError`     |
| `renderCliError`                                        | `renderAppError`   |
| `isCliError`                                            | `isAppError`       |
| `cli-error/` (folder)                                   | `app-error/`       |
| `@/cli-error` (import path)                             | `@/app-error`      |
| `CliError` tag string in `Data.TaggedError("CliError")` | `"AppError"`       |
| `case "CliError":` in classifyError                     | `case "AppError":` |

**Unchanged:** `renderDefect`, `classifyError` (function name), `PromptCancelled`, `CliExit`, `CliFlags`.

## Blast Radius

| Category                               | Count  |
| -------------------------------------- | ------ |
| Core module files to rename/rewrite    | 5      |
| Source files importing cli-error       | ~124   |
| Test files importing cli-error         | ~40    |
| `makeCliError` call sites              | ~617   |
| Total `CliError` type mentions         | ~1,216 |
| Active docs/specs referencing CliError | ~37    |
| Archived specs (historical)            | ~121   |
| Effect v4 CliError alias sites         | 3      |

## Phases

### Phase 1: Core Module Rename (serial, do first)

One agent. Must complete before all other phases.

**Tasks:**

1. **Rename folder**: `packages/cli/src/cli-error/` → `packages/cli/src/app-error/`
2. **Rename files**:
   - `cli-error.ts` → `app-error.ts`
   - `cli-error.test.ts` → `app-error.test.ts`
   - `render.ts` — keep filename, update exports
   - `render.test.ts` — keep filename, update references
   - `index.ts` — update barrel re-exports
3. **Update class definition** in `app-error.ts`:
   - `Data.TaggedError("CliError")` → `Data.TaggedError("AppError")`
   - `class CliError` → `class AppError`
   - `makeCliError` → `makeAppError`
4. **Update render.ts**:
   - `renderCliError` → `renderAppError`
   - `isCliError` → `isAppError`
   - Update internal references
5. **Update index.ts barrel**: re-export new names
6. **Update tests**: class names, function names, tag assertions

---

### Phase 2: Source Code Updates (parallel agents)

Depends on Phase 1. Split by domain area — each agent handles one slice independently.

**Agent 2a: Runtime & CLI entry points** (~8 files)

- `packages/cli/src/runtime/index.ts` — type signatures, `withCliRuntime`, `run` overloads
- `packages/cli/src/runtime/error-handling.ts` — `classifyError`, `case "CliError":`
- `packages/cli/src/command-runtime.ts` — handler signatures
- `packages/cli/src/cli.ts` — remove `CliError as EffectCliError` alias (no longer needed)
- `packages/cli/src/dev-main.ts` — update if referencing our CliError
- `packages/cli/src/main.ts` — update if referencing our CliError

**Agent 2b: Workspace, settings, lockfile** (~25 files)

- `packages/cli/src/workspace/**`
- `packages/cli/src/settings/**`
- `packages/cli/src/lockfile/**`
- All handler and test files in these areas

**Agent 2c: Commands (A-I)** (~30 files)

- `packages/cli/src/commands/auth/**`
- `packages/cli/src/commands/config/**`
- `packages/cli/src/commands/extension/**`
- `packages/cli/src/commands/init/**`
- `packages/cli/src/commands/install/**`
- All handlers + tests

**Agent 2d: Commands (L-Z)** (~30 files)

- `packages/cli/src/commands/list/**`
- `packages/cli/src/commands/mcp/**`
- `packages/cli/src/commands/pack/**`
- `packages/cli/src/commands/publish/**`
- `packages/cli/src/commands/run/**`
- `packages/cli/src/commands/server/**`
- `packages/cli/src/commands/skill/**`
- `packages/cli/src/commands/uninstall/**`
- `packages/cli/src/commands/update/**`
- All handlers + tests

**Agent 2e: Shared services & utilities** (~30 files)

- `packages/cli/src/resolution/**`
- `packages/cli/src/extensions/**`
- `packages/cli/src/agents/**`
- `packages/cli/src/registry/**`
- `packages/cli/src/git/**`
- `packages/cli/src/utils/**`
- `packages/cli/src/prompt/**`
- Any other shared modules

**Per-agent instructions:**

- Find/replace imports: `from "@/cli-error"` → `from "@/app-error"`
- Find/replace type references: `CliError` → `AppError`
- Find/replace factory calls: `makeCliError` → `makeAppError`
- Find/replace render calls: `renderCliError` → `renderAppError`
- Do NOT change references to Effect's `CliError` from `effect/unstable/cli`
- Do NOT change `PromptCancelled`, `CliExit`, `CliFlags`, or `classifyError` (function name)

---

### Phase 3: Documentation Updates (parallel agents)

Can run in parallel with Phase 2 since docs are separate files.

**Agent 3a: Project-level docs**

- `CLAUDE.md` — all references to `CliError`, `makeCliError`, `renderCliError`, `cli-error/` folder
- `effect-v4-cli-refactor-plan.md`
- `contributing/guides/cli-design.md` (if exists)

**Agent 3b: Skill files**

- `.claude/skills/cli-conventions/SKILL.md`
- `.axm/extensions/@axm/skills/effect-service/src/SKILL.md`
- Any other SKILL.md files referencing CliError

**Agent 3c: Active OpenSpec specs**

- `openspec/specs/cli-error/` — rename folder to `openspec/specs/app-error/`, update spec content
- All other active specs in `openspec/specs/*/spec.md` referencing CliError

**Agent 3d: OpenSpec archived changes** (lower priority)

- `openspec/changes/*/` files referencing CliError
- These are historical — batch update with sed-style replacement
- Acceptable to skip if team capacity is limited

---

### Phase 4: Verification (serial, do last)

One agent. Depends on all Phase 2 and Phase 3 agents completing.

**Tasks:**

1. `pnpm typecheck` — zero type errors
2. `pnpm build` — clean build
3. `pnpm test` — all unit tests pass
4. `pnpm test:e2e` — all E2E tests pass
5. `pnpm lint` — no lint errors
6. Grep for stale references:
   - `rg "CliError" packages/cli/src/` should return ONLY Effect v4 imports from `effect/unstable/cli`
   - `rg "makeCliError|renderCliError|isCliError" packages/cli/src/` should return zero results
   - `rg "cli-error" packages/cli/src/` should return zero results (no old import paths)
7. Verify the `_tag` change: search for `"CliError"` string literals in source (should be zero outside of archived docs)

## Execution Notes

- **Phase 1 is the critical path** — everything else depends on it
- **Phases 2 and 3 are fully parallel** — 9 agents can run concurrently
- **Phase 4 is the gate** — no merge until verification passes
- Total: ~4 serial steps, ~9 parallel agents
- The `Data.TaggedError` tag change from `"CliError"` to `"AppError"` is a **breaking change** for any external code pattern-matching on `_tag` — this is acceptable per project values (backward compatibility is a non-goal)

## Execution Log (2026-03-23)

### Phase 1: Core Module Rename — DONE

- Renamed `packages/cli/src/cli-error/` → `packages/cli/src/app-error/` via `git mv`
- Renamed `cli-error.ts` → `app-error.ts`, `cli-error.test.ts` → `app-error.test.ts`
- Updated class, factory, render, guard names and `Data.TaggedError` tag
- All 16 module tests pass

### Phase 2: Source Code Updates — DONE (5 parallel agents)

- **2a** Runtime & CLI entry points: 5 files updated
- **2b** Workspace, settings, lockfile: 21 files updated
- **2c** Commands A-I: 10 files updated
- **2d** Commands L-Z: 36 files updated
- **2e** Shared services & utilities: 105 files updated

### Phase 3: Documentation Updates — DONE (4 parallel agents)

- **3a** Project-level docs: 3 files (CLAUDE.md, contributing guide, refactor plan)
- **3b** Skill files: 1 file updated, 1 correctly left unchanged (Effect's CliError)
- **3c** Active OpenSpec specs: 33 files + folder rename
- **3d** Archived changes: 128 files + grammar fix ("a AppError" → "an AppError")

### Phase 4: Verification — PASS

| Check                                              | Result                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `pnpm typecheck`                                   | PASS — zero type errors                                |
| `pnpm build`                                       | PASS — clean build                                     |
| `pnpm test`                                        | PASS — 2202 passed, 1 skipped, 155 test files          |
| `pnpm lint`                                        | PASS — no lint errors                                  |
| Stale `CliError` refs                              | PASS — only Effect's `effect/unstable/cli` refs remain |
| Stale `makeCliError`/`renderCliError`/`isCliError` | PASS — zero results                                    |
| Stale `cli-error` import paths                     | PASS — zero results                                    |
| `"CliError"` string literals                       | PASS — zero results                                    |
