# Phase 5: Cross-Cutting Flows and Edge Cases

**Date:** 2026-03-23
**Method:** CLI subprocess smoke tests in temp directories, source code verification
**Adapted:** Install/uninstall blocker from Phase 2 prevented full lifecycle flow; used `skills new` as workaround

---

## 5.1 Partial Lifecycle Flow

Full flow (init -> install -> list -> disable -> update -> enable -> rename -> uninstall -> list) cannot run end-to-end because `skills install` and `skills uninstall` crash with missing `InstallSkillCommandWorkflowActions` / `UninstallSkillCommandWorkflowActions` services (INSTALL-1, UNINSTALL-1 from Phase 2).

### Adapted flow: init -> new -> list -> disable -> enable -> rename -> update

| #   | Step    | Command                                                  | Exit | Result                                                                    |
| --- | ------- | -------------------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| 1   | Init    | `axm init --yes --agent claude-code`                     | 0    | PASS -- workspace created                                                 |
| 2   | New     | `axm skills new lifecycle-skill --namespace @test --yes` | 0    | PASS -- skill created with symlink, settings entry, manifest              |
| 3   | List    | `axm skills list`                                        | 0    | ISSUE -- skill NOT shown (only lockfile-backed skills listed)             |
| 4   | Disable | `axm skills disable lifecycle-skill --yes`               | 0    | ISSUE -- settings toggled to `enabled: false`, but symlink NOT removed    |
| 5   | Enable  | `axm skills enable lifecycle-skill --yes`                | 0    | PARTIAL -- settings collapsed to string, symlink was never removed        |
| 6   | Rename  | `axm skills rename lifecycle-skill renamed-skill --yes`  | 0    | FAIL -- "Lock entry not found" (settings-only skills cannot be renamed)   |
| 7   | Update  | `axm skills update --yes`                                | 1    | FAIL -- "All source re-resolutions failed" (no lockfile entry to resolve) |

### Blocked steps

| Step               | Reason                                                                |
| ------------------ | --------------------------------------------------------------------- |
| Install (local)    | INSTALL-1: `InstallSkillCommandWorkflowActions` service not wired     |
| Install (registry) | INSTALL-1: same service wiring blocker                                |
| Uninstall          | UNINSTALL-1: `UninstallSkillCommandWorkflowActions` service not wired |

### New findings from lifecycle flow

#### LIFECYCLE-1: `skills list` does not show settings-only skills

- **Command:** `axm skills list` (after `skills new`)
- **Expected:** Skill created via `new` appears in list
- **Actual:** Only lockfile-backed skills are shown
- **Root Cause:** `handleList` at `packages/cli/src/cli-commands/skills/list/handler.ts:45` reads from `ws.getLockedSkills()` only. Skills created via `new` exist in settings and on disk but have no lockfile entry.
- **Category:** handler (data source)
- **Severity:** major -- skills can exist in the workspace without being visible in `list`

#### LIFECYCLE-2: `skills disable` does not remove symlinks for settings-only skills

- **Command:** `axm skills disable lifecycle-skill --yes` (settings-only skill)
- **Expected:** Agent symlink removed so the agent no longer sees the skill
- **Actual:** Settings toggled to `enabled: false` but symlink persists. Agent still sees the skill.
- **Root Cause:** `disableSkill` at `packages/cli/src/extensions/skills/operations/disable.ts:109` only removes symlinks when a lock entry exists. For settings-only skills (no lock entry), it falls through to the settings-only toggle at line 152, which only updates the settings `enabled` flag without touching symlinks.
- **Category:** handler (operation incomplete)
- **Severity:** major -- disabled skill remains accessible to the agent, defeating the purpose of disable

#### LIFECYCLE-3: `skills rename` fails for settings-only skills

- **Command:** `axm skills rename lifecycle-skill new-name --yes`
- **Expected:** Skill renamed in settings, symlinks updated, canonical directory renamed
- **Actual:** Exit 0, but "1 failed" -- "Lock entry not found in lockfile"
- **Root Cause:** `renameSkill` at `packages/cli/src/extensions/skills/operations/rename.ts:75-80` requires a lock entry and fails immediately if none exists. No settings-only fallback path.
- **Category:** handler (missing path)
- **Severity:** minor -- `skills new` is the only codepath that creates settings-only skills, and users can workaround by using fork instead

#### LIFECYCLE-4: Failed plan operations exit 0

- **Command:** `axm skills rename lifecycle-skill new-name --yes` (with failed operation)
- **Expected:** Non-zero exit code when an operation fails
- **Actual:** Exit 0, output shows "1 failed"
- **Root Cause:** `ws.resolvePlan()` at `packages/cli/src/workspace/service.ts:607-697` returns an `ExecutedPlan` but does not check for failed steps. The rename, enable, disable, fork, new, and update handlers all call `resolvePlan` without inspecting the result. Only the publish handler (`packages/cli/src/cli-commands/skills/publish/handler.ts:233-247`) checks for failed steps and propagates them as `CliError`.
- **Category:** handler (error propagation)
- **Severity:** major -- silent failures in multi-step workflows. Affects: rename, enable, disable, fork, new, update (6 of 10 subcommands)
- **Note:** This is a generalization of FORK-3 from Phase 4

---

## 5.2 Registry Lifecycle Flow

### Adapted flow: init -> new -> publish -> (install blocked)

| #   | Step                  | Command                                                                                  | Exit | Result                                          |
| --- | --------------------- | ---------------------------------------------------------------------------------------- | ---- | ----------------------------------------------- |
| 1   | Init                  | `axm init --yes --agent claude-code`                                                     | 0    | PASS                                            |
| 2   | New                   | `axm skills new registry-skill --namespace @test --yes`                                  | 0    | PASS                                            |
| 3   | Configure registry    | Manual: add `sources` array with `file://` registry                                      | --   | OK                                              |
| 4   | Publish               | `axm skills publish @test/skills/registry-skill --registry local --yes` (with AXM_TOKEN) | 0    | PASS -- index.json and .zip created in registry |
| 5   | Install from registry | `axm skills install @test/skills/registry-skill --yes`                                   | 1    | BLOCKED -- INSTALL-1                            |

### Fork pipeline: init -> configure -> fork -> verify

| #   | Step            | Command                                             | Exit | Result                                            |
| --- | --------------- | --------------------------------------------------- | ---- | ------------------------------------------------- |
| 1   | Init            | `axm init --yes --agent claude-code`                | 0    | PASS                                              |
| 2   | Configure       | Manual: add `sources` array with `file://` registry | --   | OK                                                |
| 3   | Fork            | `axm skills fork <fixture> --skill my-skill --yes`  | 0    | PASS (with known issues)                          |
| 4   | Verify registry | Check `index.json`                                  | --   | Correct integrity hash in registry                |
| 5   | Verify lockfile | Check `axm-lock.yaml`                               | --   | ISSUES: `integrity: ""`, `sourceName: default`    |
| 6   | List            | `axm skills list`                                   | 0    | PASS -- shows `my-skill (registry) [claude-code]` |

Fork pipeline works end-to-end but lockfile fidelity issues persist (FORK-1, FORK-2 from Phase 4 confirmed).

### Registry observations

- **Publish requires `--registry <name>`** where `<name>` matches a source in the settings `sources` array with `type: "registry"`. A plain `registry` key in settings (e.g., `"registry": "file://..."`) is NOT used by publish.
- **Fork uses the first configured registry** source automatically; no `--registry` flag needed.
- **Fork does not have `--namespace` or `--registry` flags**; it uses `@community` as the default namespace.

---

## 5.3 Edge Cases

### Root `skills` command

| Test                   | Command                  | Exit | Result                                                  |
| ---------------------- | ------------------------ | ---- | ------------------------------------------------------- |
| No subcommand          | `axm skills`             | 0    | PASS -- shows description, usage, subcommands, examples |
| `--help` on root       | `axm skills --help`      | 0    | PASS -- identical to no subcommand                      |
| `--help` on subcommand | `axm skills list --help` | 0    | PASS -- shows subcommand-specific flags                 |

All 10 subcommands listed: install, uninstall, list (alias: ls), new, fork, publish, update, enable, disable, rename.

### Global flags propagation

| Flag                        | Test                                            | Result                                                              |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `--non-interactive`         | `axm init --non-interactive`                    | PASS -- selects all detected agents automatically, exits 0          |
| `--yes` (without `--agent`) | `axm init --yes` (non-TTY)                      | FAIL -- hangs on agent multiselect prompt (AUTOINIT-1 from Phase 2) |
| `--yes --agent`             | `axm init --yes --agent claude-code`            | PASS -- bypasses prompt, uses explicit agent                        |
| `--preview`                 | `axm skills update --preview --non-interactive` | PASS (verified in Phase 2)                                          |
| `--force`                   | Tested on update in Phase 2                     | PASS -- override behavior correct                                   |

### Multi-agent symlinks

| Test               | Command                                                    | Result                                        |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| Init with 2 agents | `axm init --yes --agent claude-code --agent cursor`        | PASS                                          |
| Create skill       | `axm skills new multi-agent-skill --namespace @test --yes` | PASS                                          |
| Verify symlinks    | Check `.claude/skills/` and `.cursor/skills/`              | PASS -- both have `multi-agent-skill` symlink |

Multi-agent symlink creation works correctly across both configured agents.

### Lockfile integrity after operations

| Workspace                              | lockfileVersion | Skills                             | Valid                                                               |
| -------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Lifecycle (after new, disable, enable) | 1               | 4 builtin + 0 user (settings-only) | PASS -- structurally valid                                          |
| Fork (after fork pipeline)             | 1               | 4 builtin + 1 registry             | PARTIAL -- valid structure but empty integrity and wrong sourceName |

### Settings integrity after operations

| Workspace                              | agents                  | skills                | Valid                                      |
| -------------------------------------- | ----------------------- | --------------------- | ------------------------------------------ |
| Lifecycle (after new, disable, enable) | 1 (claude-code)         | 1 (lifecycle-skill)   | PASS -- valid JSON, correct structure      |
| Fork (after fork pipeline)             | 1 (claude-code)         | 1 (my-skill)          | PASS -- valid JSON, includes sources array |
| Multi-agent                            | 2 (claude-code, cursor) | 1 (multi-agent-skill) | PASS                                       |

---

## 5.4 Known Issues Verification

### UPDATE-2: Holdback warnings never emitted -- CONFIRMED

**Location:** `packages/cli/src/cli-commands/skills/update/handler.ts:272-282`

Lines 277-279 pass `registryRef.version` as both `latestVersion` and `resolvedVersion` to `detectHoldbackWarnings()`. The function at `packages/cli/src/cli-commands/skills/update/constraint-resolution.ts:136` short-circuits with `if (resolvedVersion === latestVersion) return []`. Since both values are identical, warnings are never emitted.

The code includes an explicit TODO comment at lines 272-276:

```
// TODO: Bug -- registryRef.version is the already-resolved version, not the latest available.
// detectHoldbackWarnings compares latestVersion vs resolvedVersion to detect when a pack
// constraint holds back a skill. Passing the same value for both means warnings are never
// emitted. To fix properly, we need a separate registry query for the latest version
// (without constraints), which is not available in the current resolution flow.
```

**Status:** Known bug, documented in code. Requires a separate registry query for the unconstrained latest version.

### HTTP(S) registry discovery not supported -- CONFIRMED

**Location:** `packages/cli/src/cli-commands/skills/fork/handler.ts:92-101`

The `isRemoteReadNotImplemented` check (line 92-95) detects `REGISTRY_REMOTE_NOT_SUPPORTED` errors, and `discoverHowToFix` (line 98-101) provides the message: "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or fork from a local/git source."

**Status:** Known limitation, error path implemented with clear user-facing guidance.

### Skipped E2E tests -- VERIFIED (12 tests, not 8)

**Location:** `packages/cli/src/cli-commands/skills/install/command.e2e.test.ts`

12 tests are skipped (not 8 as stated in the plan). They are organized in 4 groups:

| Group                                       | Count | Lines   | Purpose                                                                                                                                     |
| ------------------------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| New lockfile format (reconciliation)        | 6     | 511-687 | Verify lockfile structure: root-level skills, `_tag` discriminator, `gitTreeHash`, agents array, timestamps, complete multi-skill structure |
| New settings format (reconciliation)        | 3     | 691-781 | Verify settings structure: root-level skills, `SkillSettingsEntry` objects, multi-skill format                                              |
| Preview with new format (reconciliation)    | 2     | 785-829 | Verify preview plan labels and agent info display                                                                                           |
| Force flag with new format (reconciliation) | 1     | 833-876 | Verify `--force` reinstall preserves `installedAt` timestamp                                                                                |

All 12 are blocked by INSTALL-1 (service wiring) since they require a working `skills install`. The force flag test at line 867 explicitly asserts `entry.installedAt` equals `installedAtBefore`, confirming UPDATE-1 (timestamp overwrite bug) is a known issue.

**Status:** All 12 tests target reconciliation format expectations and will remain blocked until INSTALL-1 is fixed.

---

## Error Catalog (New Findings)

### LIFECYCLE-1: `skills list` excludes settings-only skills

- **Command:** `axm skills list` (after `axm skills new`)
- **Expected:** All workspace skills visible, including those from `new`
- **Actual:** Only lockfile-backed skills shown
- **Root Cause:** `handleList` reads from `ws.getLockedSkills()` only; `skills new` creates settings + filesystem state but no lockfile entry
- **Category:** handler (data source)
- **Severity:** major
- **Files:** `packages/cli/src/cli-commands/skills/list/handler.ts:45`, `packages/cli/src/cli-commands/skills/new/handler.ts`

### LIFECYCLE-2: Disable does not remove symlinks for settings-only skills

- **Command:** `axm skills disable <name> --yes` (settings-only skill)
- **Expected:** Symlink removed, agent no longer sees skill
- **Actual:** Settings toggle only; symlink persists
- **Root Cause:** `disableSkill` only removes symlinks when lock entry exists (line 109); settings-only path (line 152) skips symlink removal
- **Category:** handler (operation incomplete)
- **Severity:** major
- **Files:** `packages/cli/src/extensions/skills/operations/disable.ts:109,152`

### LIFECYCLE-3: Rename fails for settings-only skills

- **Command:** `axm skills rename <name> <new-name> --yes` (settings-only skill)
- **Expected:** Rename succeeds or fails with clear "not supported for this skill type" message
- **Actual:** Exit 0, "1 failed", "Lock entry not found in lockfile"
- **Root Cause:** `renameSkill` requires lock entry at line 75; no settings-only fallback
- **Category:** handler (missing path)
- **Severity:** minor
- **Files:** `packages/cli/src/extensions/skills/operations/rename.ts:75-80`

### LIFECYCLE-4: Failed plan operations exit 0

- **Command:** Any command where a plan step fails
- **Expected:** Non-zero exit code
- **Actual:** Exit 0 with "N failed" message
- **Root Cause:** `ws.resolvePlan()` returns `ExecutedPlan` without checking for failed steps. Only `publish` handler checks.
- **Category:** handler (error propagation)
- **Severity:** major
- **Affected commands:** rename, enable, disable, fork, new, update (6 of 10)
- **Not affected:** publish (checks explicitly), install/uninstall (blocked by INSTALL-1)
- **Files:** `packages/cli/src/workspace/service.ts:607-697`, `packages/cli/src/cli-commands/skills/publish/handler.ts:233-247` (reference implementation)

---

## Summary

### Test Results

| Section                | Tests  | Pass   | Fail  | Blocked | New Issues                                         |
| ---------------------- | ------ | ------ | ----- | ------- | -------------------------------------------------- |
| 5.1 Partial lifecycle  | 7      | 3      | 2     | 2       | LIFECYCLE-1, LIFECYCLE-2, LIFECYCLE-3, LIFECYCLE-4 |
| 5.2 Registry lifecycle | 6      | 4      | 0     | 2       | None (confirmed FORK-1, FORK-2)                    |
| 5.3 Edge cases         | 11     | 10     | 1     | 0       | None (confirmed AUTOINIT-1)                        |
| 5.4 Known issues       | 3      | --     | --    | --      | 12 skipped tests (not 8)                           |
| **Total**              | **27** | **17** | **3** | **4**   | **4 new**                                          |

### All Issues (Cumulative Phases 2-5)

| ID          | Description                                               | Severity | Phase |
| ----------- | --------------------------------------------------------- | -------- | ----- |
| INSTALL-1   | `InstallSkillCommandWorkflowActions` service not wired    | blocker  | 2     |
| UNINSTALL-1 | `UninstallSkillCommandWorkflowActions` service not wired  | blocker  | 2     |
| AUTOINIT-1  | `init --yes` hangs on agent multiselect in non-TTY        | major    | 2     |
| UPDATE-1    | `installedAt` timestamp overwritten on update             | major    | 2     |
| UPDATE-2    | Holdback warnings never emitted (known, documented)       | minor    | 2     |
| FORK-1      | Empty integrity in lockfile after fork                    | major    | 4     |
| FORK-2      | Wrong sourceName in lockfile after fork                   | major    | 4     |
| FORK-3      | Fork exits 0 despite failed publish step                  | major    | 4     |
| PUBLISH-1   | Auth guard device flow triggers in non-TTY with --yes     | minor    | 4     |
| LIFECYCLE-1 | `skills list` does not show settings-only skills          | major    | 5     |
| LIFECYCLE-2 | Disable does not remove symlinks for settings-only skills | major    | 5     |
| LIFECYCLE-3 | Rename fails for settings-only skills                     | minor    | 5     |
| LIFECYCLE-4 | Failed plan operations exit 0 (6 of 10 commands)          | major    | 5     |

### Severity Breakdown

| Severity  | Count                                                                                   |
| --------- | --------------------------------------------------------------------------------------- |
| Blocker   | 2 (INSTALL-1, UNINSTALL-1)                                                              |
| Major     | 8 (AUTOINIT-1, UPDATE-1, FORK-1, FORK-2, FORK-3, LIFECYCLE-1, LIFECYCLE-2, LIFECYCLE-4) |
| Minor     | 3 (UPDATE-2, PUBLISH-1, LIFECYCLE-3)                                                    |
| **Total** | **13**                                                                                  |

### Key Observations

1. **Settings-only skills are second-class citizens.** Skills created via `new` exist in settings and on disk but lack a lockfile entry. This means `list` doesn't show them, `disable` doesn't remove their symlinks, `rename` fails, and `update` fails. The root gap is that `skills new` creates settings + filesystem state but no lockfile entry.

2. **Exit code integrity is broken for 6 of 10 subcommands.** Only `publish` checks for failed plan steps and propagates errors. All other commands that use `resolvePlan` (rename, enable, disable, fork, new, update) silently exit 0 when operations fail. This affects CI reliability and script error handling.

3. **FORK-1 and FORK-2 are confirmed.** After fork, the lockfile has empty integrity and wrong sourceName. The registry has the correct integrity hash. The integrity mismatch means the lockfile cannot be used for content verification.

4. **12 E2E tests are skipped (not 8).** All target reconciliation format expectations and are blocked by INSTALL-1. One test (line 867) confirms the UPDATE-1 `installedAt` preservation expectation.

5. **Multi-agent and basic CLI flows are solid.** Root `skills` command, `--help`, multi-agent symlinks, and `--non-interactive` all work correctly.

---

## Files Examined

### Handler source files

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/list/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/update/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/fork/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/publish/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/new/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/rename/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/enable/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/disable/handler.ts`

### Operation source files

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/extensions/skills/operations/disable.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/extensions/skills/operations/enable.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/extensions/skills/operations/rename.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/update/constraint-resolution.ts`

### CLI framework

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/commands/skills/command.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/command-runtime.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/workspace/service.ts` (resolvePlan at line 607)

### E2E tests

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/install/command.e2e.test.ts` (12 skipped tests)
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/e2e/utils.ts`

### Settings / lockfile

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/settings/schema.ts`
