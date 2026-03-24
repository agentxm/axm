# Skills Remediation Plan

## Summary

- Total errors found: 13
- Blockers: 2 | Major: 8 | Minor: 3
- Unique root causes: 9
- Shared root causes: 2 (service wiring affects 8 commands; exit-code propagation affects 6 commands)
- Remediation items: 9

## Error → Remediation Mapping

| Error ID    | Description                                              | Severity | Remediation Item |
| ----------- | -------------------------------------------------------- | -------- | ---------------- |
| INSTALL-1   | InstallSkillCommandWorkflowActions not wired             | blocker  | 1                |
| UNINSTALL-1 | UninstallSkillCommandWorkflowActions not wired           | blocker  | 1                |
| LIFECYCLE-4 | Failed plan operations exit 0 (6/10 commands)            | major    | 2                |
| FORK-3      | Fork exits 0 when publish fails                          | major    | 2                |
| AUTOINIT-1  | --yes doesn't bypass agent selection in auto-init        | major    | 3                |
| UPDATE-1    | installedAt overwritten on update                        | major    | 4                |
| FORK-2      | sourceName always "default" in lockfile                  | major    | 5                |
| FORK-1      | integrity always "" in lockfile after fork               | major    | 6                |
| LIFECYCLE-1 | skills list excludes settings-only skills                | major    | 7                |
| LIFECYCLE-2 | Disable doesn't remove symlinks for settings-only skills | major    | 7                |
| LIFECYCLE-3 | Rename fails for settings-only skills                    | minor    | 7                |
| PUBLISH-1   | Auth guard device flow triggers with --yes               | minor    | 8                |
| UPDATE-2    | Holdback warnings never emitted (known)                  | minor    | 9 (deferred)     |

---

## Remediation Order

### 1. Wire missing service layers in CLI runtime [blocker]

- **Errors resolved:** INSTALL-1, UNINSTALL-1
- **Root cause:** `withCommandRuntime()` in `command-runtime.ts` provides `CliFlags`, `Clack`, `Telemetry`, `Workspace`, `SourceHostProviders` — but not the `*Manager` or `*CommandWorkflowActions` layers. These are defined but only provided in test files.
- **Fix:** Wire `*ManagerLive` and `*CommandWorkflowActionsLive` layers into the runtime. Two approaches:
  - **(a) Per-command layer injection:** Each command definition (e.g., `commands/skills/install.ts`) provides its own actions layer alongside the workspace layer. Keeps commands self-contained.
  - **(b) withCommandRuntime extension:** Add an optional `layers` parameter to `withCommandRuntime` that commands pass their action layers through.
  - **Recommendation:** (a) — per-command injection matches the existing pattern where each command file already configures its own workspace options.
- **Files:**
  - `packages/cli/src/command-runtime.ts` — may need API extension
  - `packages/cli/src/commands/skills/install.ts` — wire `InstallSkillCommandWorkflowActionsLive` + `SkillManagerLive`
  - `packages/cli/src/commands/skills/uninstall.ts` — wire `UninstallSkillCommandWorkflowActionsLive` + `SkillManagerLive`
  - `packages/cli/src/commands/packs/install.ts` — wire packs equivalents
  - `packages/cli/src/commands/packs/uninstall.ts`
  - `packages/cli/src/commands/commands/install.ts`
  - `packages/cli/src/commands/commands/uninstall.ts`
  - `packages/cli/src/commands/mcp-servers/install.ts`
  - `packages/cli/src/commands/mcp-servers/uninstall.ts`
- **Tests:** 13 currently-failing E2E tests should pass; 12 skipped tests should be re-evaluated
- **Depends on:** (none — foundational, must be first)

---

### 2. Propagate failed plan steps as errors [major]

- **Errors resolved:** LIFECYCLE-4, FORK-3
- **Root cause:** `applyPlan` (apply-plan.ts:97) converts all `CliError` to result objects and never fails. `resolvePlan` (service.ts:694-696) returns `ExecutedPlan` without checking for failed steps. Only `publish` handler checks explicitly.
- **Fix:** Make `resolvePlan` inspect the `ExecutedPlan` and fail with `CliError` when any step has an error result. This protects all current and future callers.
  - Reference implementation: `publish/handler.ts:233-247` shows the correct pattern
  - Move that pattern into `resolvePlan` itself so no handler can forget
- **Files:**
  - `packages/cli/src/workspace/service.ts` — `resolvePlan` method (~line 694)
  - `packages/cli/src/cli-commands/skills/publish/handler.ts` — remove per-handler check (now redundant)
- **Tests:** Add E2E test for failed operation producing non-zero exit code
- **Depends on:** (none)

---

### 3. Fix auto-init agent selection with --yes [major]

- **Errors resolved:** AUTOINIT-1
- **Root cause:** `initialization.ts:73` only checks `flags.nonInteractive`, not `flags.yes`. When auto-init is triggered implicitly by another command, the agent selection prompt blocks headless use.
- **Fix:** When auto-init is triggered implicitly (not via `axm init`), auto-detect agents regardless of `--yes`. Add a flag to `WorkspaceContextOptions` to indicate "auto-init" vs "explicit init", and skip the multiselect when auto-initializing.
- **Files:**
  - `packages/cli/src/workspace/initialization.ts` — line 73, agent selection logic
  - `packages/cli/src/workspace/service.ts` — pass auto-init flag
- **Tests:** E2E test: `axm skills list --yes` in fresh dir should auto-init and list without hanging
- **Depends on:** (none)

---

### 4. Preserve installedAt timestamp on update [major]

- **Errors resolved:** UPDATE-1
- **Root cause:** `sourceToLockEntry()` at `source-to-lock-entry.ts:38-42` always sets `installedAt: input.now`. No input for preserving existing timestamps.
- **Fix:** Add optional `existingInstalledAt: Option<Date>` to `SourceToLockEntryInput`. When present, use it for `installedAt` instead of `input.now`. Update callers in `update/handler.ts` to pass the existing lock entry's `installedAt`.
- **Files:**
  - `packages/cli/src/sources/source-to-lock-entry.ts` — add `existingInstalledAt` field, use in `commonFields`
  - `packages/cli/src/cli-commands/skills/update/handler.ts` — pass existing `installedAt` from lock entry
  - `packages/cli/src/extensions/skills/operations/install.ts` — pass `Option.none()` for fresh installs
  - `packages/cli/src/extensions/skills/manager.ts` — pass `Option.none()` for fresh installs
- **Tests:** Un-skip E2E test at `install/command.e2e.test.ts:866-867` (asserts `installedAt` preserved)
- **Depends on:** Item 1 (for full E2E testing of install path)

---

### 5. Thread sourceName through install and fork [major]

- **Errors resolved:** FORK-2
- **Root cause:** `installSkill` (install.ts:490) and `SkillManager` (manager.ts:68) hardcode `sourceName: Option.none()`, producing `"default"` in lockfile.
- **Fix:** Add `sourceName: Option<string>` to `InstallSkillOperationArgs`. Thread the registry source name from the fork handler (which knows it at line 245: `registrySource.name`) through the install operation to `sourceToLockEntry`.
- **Files:**
  - `packages/cli/src/extensions/skills/operations/install.ts` — add `sourceName` to args, pass to `sourceToLockEntry`
  - `packages/cli/src/extensions/skills/manager.ts` — add `sourceName` to `buildSkillLockEntry`
  - `packages/cli/src/cli-commands/skills/fork/handler.ts` — pass `registryName` to install step
  - `packages/cli/src/sources/source-to-lock-entry.ts` — already uses `input.sourceName`, just needs correct input
- **Tests:** E2E test: fork from named registry → verify lockfile `sourceName` matches registry name
- **Depends on:** Item 1 (for E2E testing of install-from-registry)

---

### 6. Fix fork integrity propagation [major]

- **Errors resolved:** FORK-1
- **Root cause:** `registryRef` in `fork/handler.ts:269` is built with `integrity: ""` before publish runs. The plan model builds all steps upfront (static), so publish's computed integrity can't flow to the install step.
- **Fix:** Restructure the fork handler to run publish first (outside the plan), capture the integrity hash from the result, then build the install step's `registryRef` with the computed integrity.
  - Alternative: After plan execution, read the integrity from the registry `index.json` and update the lockfile entry. Less clean but avoids restructuring the pipeline.
- **Files:**
  - `packages/cli/src/cli-commands/skills/fork/handler.ts` — restructure publish/install ordering (~lines 253-327)
- **Tests:** E2E test: fork → verify lockfile `integrity` matches registry archive hash
- **Depends on:** Item 1 (for E2E testing), Item 5 (fixes related lockfile data)

---

### 7. Support settings-only skills in list, disable, rename [major/minor]

- **Errors resolved:** LIFECYCLE-1, LIFECYCLE-2, LIFECYCLE-3
- **Root cause:** Skills created via `skills new` exist in settings and on disk but have no lockfile entry. `list` only reads from lockfile. `disable` only removes symlinks when lock entry exists. `rename` requires a lock entry.
- **Fix:**
  - **list:** Merge settings-sourced skills with lockfile-sourced skills in `handleList`. Show settings-only skills with a `(local)` label.
  - **disable:** In `disableSkill`, add symlink removal to the settings-only path (line 152 in `disable.ts`).
  - **rename:** Add a settings-only fallback path in `renameSkill` that renames the canonical dir, updates settings key, and updates symlinks without requiring a lock entry.
- **Files:**
  - `packages/cli/src/cli-commands/skills/list/handler.ts` — merge data sources
  - `packages/cli/src/extensions/skills/operations/disable.ts` — add symlink removal at line 152
  - `packages/cli/src/extensions/skills/operations/rename.ts` — add settings-only path
- **Tests:** E2E tests: `skills new` → `list` shows it; `new` → `disable` → verify symlink removed; `new` → `rename` → verify success
- **Depends on:** (none — testable with `skills new` which works)

---

### 8. Fix auth guard --yes behavior in non-TTY [minor]

- **Errors resolved:** PUBLISH-1
- **Root cause:** Auth guard at `guard.ts:88-97` auto-accepts login when `--yes` is true, triggering device code flow that hangs without browser interaction.
- **Fix:** Before starting device flow, check if the environment can actually complete it (has TTY for output, or at minimum check `nonInteractive`). If non-interactive, fail with a clear message: "Authentication required. Set AXM_TOKEN or run `axm auth login` first."
- **Files:**
  - `packages/cli/src/auth/guard.ts` — add non-interactive check before `inlineLogin()`
- **Tests:** E2E test: `axm skills publish ... --yes --non-interactive` without token → clear error message
- **Depends on:** (none)

---

### 9. Holdback warnings — latestVersion query [minor, deferred]

- **Errors resolved:** UPDATE-2
- **Root cause:** `update/handler.ts:277-280` passes `registryRef.version` as both `latestVersion` and `resolvedVersion` to `detectHoldbackWarnings()`. A separate registry query for the unconstrained latest version is needed.
- **Fix:** Add a `getLatestVersion()` registry query (without constraint resolution) and pass the result as `latestVersion`. This requires registry API changes beyond the current scope.
- **Decision:** **Defer.** Known and documented in code with TODO. Low user impact — holdback is an informational warning, not a correctness issue.
- **Depends on:** Registry API extension (out of scope)

---

## Verification Checklist

- [ ] All existing E2E tests pass (37 currently failing → 0)
- [ ] 12 skipped E2E tests reviewed — un-skip those unblocked by Item 1; document remainder
- [ ] All unit tests pass (2202 currently passing, 0 failing)
- [ ] Full lifecycle flow passes: init → install → list → disable → update → enable → rename → uninstall → list
- [ ] Registry lifecycle flow passes: init → install (local) → fork → uninstall → install (registry) → update → uninstall
- [ ] `skills new` → list → disable → enable → rename works (settings-only path)
- [ ] Failed plan operations produce non-zero exit codes
- [ ] Lockfile integrity: correct `integrity`, `sourceName`, preserved `installedAt` after fork/update
- [ ] Build clean, typecheck clean, lint clean

## Quality Gates

- [x] Every error from Phases 2-5 is accounted for (13/13 mapped to remediation items)
- [x] No circular dependencies in remediation order
- [x] Shared fixes identified: Item 1 (8 commands), Item 2 (6 commands)
- [x] Each item has clear acceptance criteria
- [x] Plan is executable in order — each item leaves the codebase in a valid state
- [x] Known issues documented: UPDATE-2 deferred with rationale; HTTP(S) registry is a known limitation (not a bug)
- [x] Skipped tests reviewed: 12 tests in install E2E, blocked by Item 1, one confirms UPDATE-1
