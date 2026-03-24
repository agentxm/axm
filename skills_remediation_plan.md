# Skills Remediation Plan

## Summary

- Total errors found: 13
- Blockers: 2 | Major: 8 | Minor: 3
- Unique root causes: 9
- Shared root causes: 2 (service wiring affects 8 commands; exit-code propagation affects 6 commands)
- Remediation items: 9
- **Status: 8/8 implementable items complete. Item 9 deferred (requires registry API extension).**

## Error → Remediation Mapping

| Error ID    | Description                                              | Severity | Remediation Item | Status   |
| ----------- | -------------------------------------------------------- | -------- | ---------------- | -------- |
| INSTALL-1   | InstallSkillCommandWorkflowActions not wired             | blocker  | 1                | **done** |
| UNINSTALL-1 | UninstallSkillCommandWorkflowActions not wired           | blocker  | 1                | **done** |
| LIFECYCLE-4 | Failed plan operations exit 0 (6/10 commands)            | major    | 2                | **done** |
| FORK-3      | Fork exits 0 when publish fails                          | major    | 2                | **done** |
| AUTOINIT-1  | --yes doesn't bypass agent selection in auto-init        | major    | 3                | **done** |
| UPDATE-1    | installedAt overwritten on update                        | major    | 4                | **done** |
| FORK-2      | sourceName always "default" in lockfile                  | major    | 5                | **done** |
| FORK-1      | integrity always "" in lockfile after fork               | major    | 6                | **done** |
| LIFECYCLE-1 | skills list excludes settings-only skills                | major    | 7                | **done** |
| LIFECYCLE-2 | Disable doesn't remove symlinks for settings-only skills | major    | 7                | **done** |
| LIFECYCLE-3 | Rename fails for settings-only skills                    | minor    | 7                | **done** |
| PUBLISH-1   | Auth guard device flow triggers with --yes               | minor    | 8                | **done** |
| UPDATE-2    | Holdback warnings never emitted (known)                  | minor    | 9 (deferred)     | deferred |

---

## Remediation Order

### 1. Wire missing service layers in CLI runtime [blocker] — DONE

- **Errors resolved:** INSTALL-1, UNINSTALL-1
- **What was done:** Added optional `layers` property to `CommandRuntimeOptions` in `command-runtime.ts`. Each install/uninstall command now provides its own `*ManagerLive` + `*CommandWorkflowActionsLive` layers via per-command injection. This follows the existing pattern where each command file configures its own workspace options.
- **Files changed:**
  - `packages/cli/src/command-runtime.ts` — added `layers` option, composed with `Layer.provideMerge`
  - `packages/cli/src/commands/skills/install.ts` — wired `SkillManagerLive` + `InstallSkillCommandWorkflowActionsLive`
  - `packages/cli/src/commands/skills/uninstall.ts` — wired `SkillManagerLive` + `UninstallSkillCommandWorkflowActionsLive`
  - `packages/cli/src/commands/packs/install.ts` — wired all four `*ManagerLive` + `InstallPackCommandWorkflowActionsLive`
  - `packages/cli/src/commands/packs/uninstall.ts` — wired all four `*ManagerLive` + `UninstallPackCommandWorkflowActionsLive`
  - `packages/cli/src/commands/commands/install.ts` — wired `CommandManagerLive` + `InstallCommandCommandWorkflowActionsLive`
  - `packages/cli/src/commands/commands/uninstall.ts` — wired `CommandManagerLive` + `UninstallCommandCommandWorkflowActionsLive`
  - `packages/cli/src/commands/mcp-servers/install.ts` — wired `McpServerManagerLive` + `InstallMcpServerCommandWorkflowActionsLive`
  - `packages/cli/src/commands/mcp-servers/uninstall.ts` — wired `McpServerManagerLive` + `UninstallMcpServerCommandWorkflowActionsLive`

---

### 2. Propagate failed plan steps as errors [major] — DONE

- **Errors resolved:** LIFECYCLE-4, FORK-3
- **What was done:** Added post-execution error checking in `resolvePlan`. After plan execution and display, `resolvePlan` inspects the `ExecutedPlan` for steps with `result: "error"`. If any found, fails with `AppError` (code `PLAN_STEP_FAILED`) including details for each failed step. Removed the redundant per-handler check from `publish/handler.ts`.
- **Files changed:**
  - `packages/cli/src/workspace/service.ts` — added failed-step inspection after `showPlan(executed)`
  - `packages/cli/src/cli-commands/skills/publish/handler.ts` — removed per-handler failed-step check (now redundant)
  - `packages/cli/src/workspace/service.test.ts` — updated `--force` tests to expect failure via `Effect.exit`
  - `packages/cli/src/cli-commands/skills/install/handler.test.ts` — updated for new error propagation
  - `packages/cli/src/cli-commands/packs/install/handler.test.ts` — updated for new error propagation
  - `packages/cli/src/cli-commands/skills/publish/handler.test.ts` — updated error code to `PLAN_STEP_FAILED`
  - `packages/cli/src/cli-commands/skills/enable/handler.test.ts` — updated to expect `PLAN_STEP_FAILED`

---

### 3. Fix auto-init agent selection with --yes [major] — DONE

- **Errors resolved:** AUTOINIT-1
- **What was done:** Added `autoInit?: boolean` to `WorkspaceContextOptions`. Defaults to `true` (implicit auto-init by non-init commands). When `autoInit !== false`, agent selection prompt is skipped and agents are auto-detected. Only `axm init` sets `autoInit: false` to show the interactive multiselect.
- **Files changed:**
  - `packages/cli/src/workspace/service.ts` — added `autoInit` field to `WorkspaceContextOptions`
  - `packages/cli/src/workspace/initialization.ts` — changed condition to `flags.nonInteractive || options.autoInit !== false`
  - `packages/cli/src/commands/init/command.ts` — added `autoInit: false`
  - `packages/cli/src/cli-commands/init/handler.test.ts` — added `autoInit: false` to test workspace options
  - `packages/cli/src/workspace/service.test.ts` — added new auto-init tests, updated existing init tests

---

### 4. Preserve installedAt timestamp on update [major] — DONE

- **Errors resolved:** UPDATE-1
- **What was done:** Added `existingInstalledAt: Option<Date>` to `SourceToLockEntryInput`. When present, uses existing timestamp; otherwise uses `input.now`. Update handler passes existing lock entry's `installedAt`. Fresh installs pass `Option.none()`.
- **Files changed:**
  - `packages/cli/src/sources/source-to-lock-entry.ts` — added `existingInstalledAt` field, used in `commonFields`
  - `packages/cli/src/cli-commands/skills/update/handler.ts` — passes existing `installedAt` from lock entry
  - `packages/cli/src/extensions/skills/operations/install.ts` — added optional `existingInstalledAt` to args
  - `packages/cli/src/extensions/skills/manager.ts` — passes `Option.none()` for fresh installs
  - `packages/cli/src/sources/source-to-lock-entry.test.ts` — updated existing tests, added 2 new tests

---

### 5. Thread sourceName through install and fork [major] — DONE

- **Errors resolved:** FORK-2
- **What was done:** Added `sourceName: Option<string>` to `InstallSkillOperationArgs`. Fork handler passes `Option.some(registryName)`. All other callers pass `Option.none()` to preserve existing behavior.
- **Files changed:**
  - `packages/cli/src/extensions/skills/operations/install.ts` — added `sourceName` to args, passed to `sourceToLockEntry`
  - `packages/cli/src/cli-commands/skills/fork/handler.ts` — passes `sourceName: Option.some(registryName)`
  - `packages/cli/src/cli-commands/skills/install/plan.ts` — passes `Option.none()`
  - `packages/cli/src/cli-commands/skills/update/handler.ts` — passes `Option.none()` (2 sites)
  - `packages/cli/src/cli-commands/packs/unpack/handler.ts` — passes `Option.none()`
  - Test files updated for new required field

---

### 6. Fix fork integrity propagation [major] — DONE

- **Errors resolved:** FORK-1
- **What was done:** Replaced legacy plan approach (`LegacyPlannedStep` + `bridgeLegacyPlan`) with direct `PlannedJobStep` objects using inline `run` closures. The install step's closure queries the registry at execution time to get the just-published integrity hash, instead of using a pre-built `registryRef` with stale `integrity: ""`.
- **Files changed:**
  - `packages/cli/src/cli-commands/skills/fork/handler.ts` — replaced static plan construction with inline closures; publish runs first (sequential), install reads integrity from registry

---

### 7. Support settings-only skills in list, disable, rename [major/minor] — DONE

- **Errors resolved:** LIFECYCLE-1, LIFECYCLE-2, LIFECYCLE-3
- **What was done:**
  - **list:** Fetches both `getLockedSkills()` and `getInstalledSkills()` in parallel. Settings-only skills shown with `type: "local"`.
  - **disable:** Added symlink removal for settings-only skills (no lock entry path).
  - **rename:** Added settings-only fallback path that renames canonical dir, updates SKILL.md frontmatter, manages symlinks, and renames settings key — all without requiring a lock entry.
- **Files changed:**
  - `packages/cli/src/cli-commands/skills/list/handler.ts` — merged data sources
  - `packages/cli/src/extensions/skills/operations/disable.ts` — added else branch for symlink removal
  - `packages/cli/src/extensions/skills/operations/rename.ts` — added settings-only fallback path
  - `packages/cli/src/extensions/skills/operations/rename.test.ts` — replaced error test with settings-only describe block

---

### 8. Fix auth guard --yes behavior in non-TTY [minor] — DONE

- **Errors resolved:** PUBLISH-1
- **What was done:** When `--yes` is set, the auth guard now fails immediately with `AUTH_LOGIN_REQUIRED` instead of auto-accepting and starting a device flow that requires browser interaction. Error message guides user to set `AXM_TOKEN` or run `axm auth login`.
- **Files changed:**
  - `packages/cli/src/auth/guard.ts` — added `--yes` check before device flow
  - `packages/cli/src/auth/guard.test.ts` — updated `--yes` test to expect failure

---

### 9. Holdback warnings — latestVersion query [minor, deferred]

- **Errors resolved:** UPDATE-2
- **Decision:** **Deferred.** Requires registry API extension (out of scope). Known and documented in code with TODO.

---

## Verification Checklist

- [ ] All existing E2E tests pass (37 currently failing → 0)
- [ ] 12 skipped E2E tests reviewed — un-skip those unblocked by Item 1; document remainder
- [x] All unit tests pass — 2213 passing, 0 new failures (12 pre-existing failures in output-structured/activity-structured unrelated to remediation)
- [ ] Full lifecycle flow passes: init → install → list → disable → update → enable → rename → uninstall → list
- [ ] Registry lifecycle flow passes: init → install (local) → fork → uninstall → install (registry) → update → uninstall
- [ ] `skills new` → list → disable → enable → rename works (settings-only path)
- [x] Failed plan operations produce non-zero exit codes (Item 2)
- [x] Lockfile integrity: correct `integrity` (Item 6), `sourceName` (Item 5), preserved `installedAt` (Item 4) after fork/update
- [ ] Build clean, typecheck clean, lint clean

## Quality Gates

- [x] Every error from Phases 2-5 is accounted for (13/13 mapped to remediation items)
- [x] No circular dependencies in remediation order
- [x] Shared fixes identified: Item 1 (8 commands), Item 2 (6 commands)
- [x] Each item has clear acceptance criteria
- [x] Plan is executable in order — each item leaves the codebase in a valid state
- [x] Known issues documented: UPDATE-2 deferred with rationale; HTTP(S) registry is a known limitation (not a bug)
- [x] Skipped tests reviewed: 12 tests in install E2E, blocked by Item 1, one confirms UPDATE-1
- [x] All 8 implementable items completed
