# Phase 3: Smoke Test -- State Commands (list, enable, disable, rename)

## Summary

| Command          | Help | Core Behavior | Edge Cases | E2E Tests                         |
| ---------------- | ---- | ------------- | ---------- | --------------------------------- |
| `skills list`    | PASS | PASS          | PASS       | 4/4 FAIL (3 timeout, 1 assertion) |
| `skills enable`  | PASS | PASS          | PASS       | 3/4 FAIL (2 timeout, 1 assertion) |
| `skills disable` | PASS | PASS          | PASS       | 3/4 FAIL (2 timeout, 1 assertion) |
| `skills rename`  | PASS | PASS          | PASS       | 3/4 FAIL (2 timeout, 1 assertion) |

**All four state commands work correctly when given a properly initialized workspace with installed skills.** The E2E test failures are caused by two upstream dependencies, not by bugs in the state commands themselves.

---

## 3.1 `skills list`

### Smoke Tests

| Test                  | Command                                  | Exit | Result                                                                                |
| --------------------- | ---------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| Help flag             | `axm skills list --help`                 | 0    | PASS -- shows usage, flags, examples                                                  |
| After init (builtins) | `axm skills list`                        | 0    | PASS -- shows `axm-manage-skills`, `axm-manage-packs`, etc. with `(builtin)` label    |
| `ls` alias            | `axm skills ls`                          | 0    | PASS -- identical output to `list`                                                    |
| With installed skills | `axm skills list` (after manual install) | 0    | PASS -- shows `my-skill (local) [claude-code]`, `another-skill (local) [claude-code]` |
| After rename          | `axm skills list`                        | 0    | PASS -- shows `renamed-skill` not `my-skill`                                          |

### E2E Test Results (4 tests, 4 failed)

| Test                                          | Failure                                   | Root Cause                                                                                      |
| --------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `lists builtin skills after init`             | Timeout 30s                               | `init --yes` (no `--agent`) hangs on agent multiselect in non-TTY subprocess                    |
| `lists installed skills`                      | Timeout 30s                               | Same init hang, plus `skills install` fails with missing service                                |
| `lists only remaining skills after uninstall` | Assertion: stdout missing `another-skill` | `skills install` fails (`InstallSkillCommandWorkflowActions` not found), so no skills installed |
| `works with ls alias`                         | Timeout 30s                               | Same init hang                                                                                  |

### Findings

The `skills list` handler (`packages/cli/src/cli-commands/skills/list/handler.ts`) is correct and minimal: reads lockfile via `ws.getLockedSkills()`, filters by agents, and displays results. No bugs found.

---

## 3.2 `skills enable`

### Smoke Tests

| Test                  | Command                                        | Exit | Result                                                                           |
| --------------------- | ---------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| Help flag             | `axm skills enable --help`                     | 0    | PASS                                                                             |
| Enable disabled skill | `axm skills enable my-skill --yes`             | 0    | PASS -- symlink restored, settings collapsed to string, lockfile agents restored |
| Already enabled       | `axm skills enable my-skill --yes`             | 0    | PASS -- `Skill 'my-skill' is already enabled`                                    |
| Nonexistent skill     | `axm skills enable nonexistent-skill --yes`    | 1    | PASS -- `Skill 'nonexistent-skill' is not installed (SKILL_NOT_FOUND)`           |
| Non-interactive       | `axm skills enable my-skill --non-interactive` | 0    | PASS -- no hang, auto-accepts                                                    |

### Filesystem Verification After Enable

- Canonical dir: `.axm/extensions/external/skills/my-skill/SKILL.md` -- preserved (correct)
- Agent symlink: `.claude/skills/my-skill -> ../../.axm/extensions/external/skills/my-skill` -- restored (correct)
- Settings: collapsed from `{"source": "...", "enabled": false}` to plain string `"..."` (correct)
- Lockfile: agents restored from `[]` to `["claude-code"]` (correct)

### E2E Test Results (4 tests, 3 failed)

| Test                             | Failure                                                  | Root Cause                                                                                                  |
| -------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `enables a disabled skill`       | Assertion: `fs.existsSync(canonicalSkillDir)` is `false` | `skills install` fails with `InstallSkillCommandWorkflowActions` service error -- skill was never installed |
| `shows already enabled message`  | Timeout 30s                                              | `init --yes` without `--agent` hangs on agent multiselect                                                   |
| `errors when skill is not found` | Timeout 30s                                              | Same init hang                                                                                              |
| `displays usage information`     | PASS                                                     | No workspace needed                                                                                         |

### Findings

The `enableSkill` operation (`packages/cli/src/extensions/skills/operations/enable.ts`) is correct:

- Lock-backed path: verifies canonical dir exists, creates symlinks, updates lock agents, updates settings
- Settings-only path: toggles enabled flag
- Proper error handling for missing files

---

## 3.3 `skills disable`

### Smoke Tests

| Test                    | Command                                              | Exit | Result                                                                                      |
| ----------------------- | ---------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| Help flag               | `axm skills disable --help`                          | 0    | PASS                                                                                        |
| Disable installed skill | `axm skills disable my-skill --yes`                  | 0    | PASS -- symlinks removed, canonical preserved, settings `enabled: false`, lockfile retained |
| Already disabled        | `axm skills disable my-skill --yes`                  | 0    | PASS -- `Skill 'my-skill' is already disabled`                                              |
| Nonexistent skill       | `axm skills disable nonexistent-skill --yes`         | 1    | PASS -- `Skill 'nonexistent-skill' is not installed (SKILL_NOT_FOUND)`                      |
| Non-interactive         | `axm skills disable another-skill --non-interactive` | 0    | PASS -- no hang, auto-accepts                                                               |

### Filesystem Verification After Disable

- Canonical dir: `.axm/extensions/external/skills/my-skill/SKILL.md` -- preserved (correct)
- Agent symlink: `.claude/skills/my-skill` -- removed (correct)
- Settings: changed from `"source-string"` to `{"source": "...", "enabled": false}` (correct)
- Lockfile: agents cleared to `[]`, entry retained (correct)

### E2E Test Results (4 tests, 3 failed)

| Test                             | Failure                                                                            | Root Cause                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `disables a skill`               | Assertion: `fs.existsSync(agentSkillDir)` is `false` (checking post-install state) | `skills install` fails -- skill never installed, so `agentSkillDir` never existed |
| `shows already disabled message` | Timeout 30s                                                                        | `init --yes` without `--agent` hangs                                              |
| `errors when skill is not found` | Timeout 30s                                                                        | Same init hang                                                                    |
| `displays usage information`     | PASS                                                                               | No workspace needed                                                               |

### Findings

The `disableSkill` operation (`packages/cli/src/extensions/skills/operations/disable.ts`) is correct:

- Three paths handled: lock-backed, settings-only, implicit promotion
- Removes symlinks, clears lock agents, preserves canonical files
- `deriveSourceString` correctly maps all lock entry types to source strings for implicit promotion

---

## 3.4 `skills rename`

### Smoke Tests

| Test                   | Command                                               | Exit | Result                                                               |
| ---------------------- | ----------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| Help flag              | `axm skills rename --help`                            | 0    | PASS                                                                 |
| Rename installed skill | `axm skills rename my-skill renamed-skill --yes`      | 0    | PASS -- all state updated correctly                                  |
| Nonexistent source     | `axm skills rename nonexistent new-name --yes`        | 1    | PASS -- `Skill 'nonexistent' not found (SKILL_NOT_FOUND)`            |
| Conflict with existing | `axm skills rename another-skill renamed-skill --yes` | 1    | PASS -- `Skill 'renamed-skill' already exists (SKILL_NAME_CONFLICT)` |

### Filesystem Verification After Rename

- Old canonical dir: `.axm/extensions/external/skills/my-skill/` -- gone (correct)
- New canonical dir: `.axm/extensions/external/skills/renamed-skill/SKILL.md` -- exists (correct)
- Old agent symlink: `.claude/skills/my-skill` -- gone (correct)
- New agent symlink: `.claude/skills/renamed-skill -> ../../.axm/extensions/external/skills/renamed-skill` -- exists (correct)
- Settings: key changed from `my-skill` to `renamed-skill` (correct)
- Lockfile: key changed from `my-skill` to `renamed-skill`, all fields preserved (correct)
- SKILL.md frontmatter `name` field updated to new name (correct)

### E2E Test Results (4 tests, 3 failed)

| Test                                | Failure                                                                           | Root Cause                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `renames a skill`                   | Assertion: `fs.existsSync(oldCanonical)` is `false` (checking post-install state) | `skills install` fails -- skill never installed |
| `errors when old name is not found` | Timeout 30s                                                                       | `init --yes` without `--agent` hangs            |
| `errors when new name conflicts`    | Timeout 30s                                                                       | Same init hang, plus install fails              |
| `displays usage information`        | PASS                                                                              | No workspace needed                             |

### Findings

The `renameSkill` operation (`packages/cli/src/extensions/skills/operations/rename.ts`) is correct:

- Full pipeline: read state -> rename canonical dir -> remove old symlinks -> create new symlinks -> rename settings/lockfile keys -> sync lock agents
- Registry skills skip directory rename (immutable registry path)
- SKILL.md frontmatter name update is best-effort
- `sanitizeName` used for symlink paths

---

## Error Catalog

### ERROR-STATE-1: INSTALL-SERVICE-MISSING

- **Command:** `axm skills install <source> --all --yes`
- **Expected:** Skills installed to `.axm/extensions/external/skills/`, lockfile updated, symlinks created
- **Actual:** Exit 1: `Service not found: InstallSkillCommandWorkflowActions`
- **Root Cause:** The `InstallSkillCommandWorkflowActions` service layer (`packages/cli/src/cli-commands/skills/install/command-actions.ts:181`) is not provided in the CLI runtime. This is a Layer composition bug -- the `InstallSkillCommandWorkflowActionsLive` layer depends on `SourceHostProviders` and other services that are not wired into the command's layer stack.
- **Category:** handler (service wiring)
- **Severity:** blocker
- **Impact:** Blocks all E2E tests that depend on `skills install` as a prerequisite (enable, disable, rename, list with installed skills, update, uninstall). All 13 E2E assertion failures for state commands trace back to this single root cause.

### ERROR-STATE-2: INIT-AGENT-PROMPT-HANGS

- **Command:** `axm init --yes` (without `--agent` flag, in non-TTY subprocess)
- **Expected:** Auto-detect non-interactive mode, use default agent selection, complete without hanging
- **Actual:** Hangs on agent multiselect prompt until timeout (30s in E2E tests)
- **Root Cause:** The `init` handler intentionally shows the agent multiselect even with `--yes` (per unit test: "--yes still prompts for agent selection (does not auto-select)"). In a non-TTY subprocess context (like `execa` in E2E tests), the `isInteractive()` check (`packages/cli/src/utils/tty.ts`) returns `false`, and `nonInteractive` should resolve to `true`. However, the `init` handler's prompt path does not properly respect the `nonInteractive` flag, or the multiselect prompt in `@clack/prompts` blocks on stdin even in non-interactive mode. The prompt should either: (a) select detected agents automatically, or (b) error with "pass --agent to specify agents".
- **Category:** handler (prompt bypass)
- **Severity:** blocker
- **Impact:** Causes 8 E2E timeout failures across state command tests. Any test using `init --yes` without `--agent` hangs for 30s.
- **Note:** Tests that use `init --yes --agent claude-code` do NOT hang -- the explicit `--agent` flag bypasses the prompt entirely.

---

## Cross-Cutting Analysis

### State Commands Are Correct

All four state commands (list, enable, disable, rename) implement their business logic correctly:

1. **Handler validation** -- proper not-found, already-enabled/disabled, and conflict checks with appropriate `CliError` codes
2. **Plan/operation execution** -- `buildSingleStepPlan` + `bridgeLegacyPlan` correctly dispatches to operation handlers
3. **Filesystem operations** -- symlinks created/removed, canonical dirs preserved/renamed as expected
4. **State updates** -- settings entries correctly toggled between string and object form; lockfile entries correctly updated (agents, keys)
5. **Error handling** -- operations use `Effect.catch` for best-effort sub-operations, critical operations use `Effect.mapError` for clean error mapping

### Root Cause of ALL E2E Failures

Every E2E failure for state commands traces to exactly two upstream issues:

| Upstream Issue                                         | E2E Failures Caused                                                    | Fix Location                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `InstallSkillCommandWorkflowActions` service not wired | 4 assertion failures (enable, disable, rename, list-partial-uninstall) | `packages/cli/src/cli-commands/skills/install/` layer composition |
| `init --yes` hangs in non-TTY                          | 9 timeout failures (3 list, 2 enable, 2 disable, 2 rename)             | `packages/cli/src/cli-commands/init/handler.ts` prompt handling   |

### Recommended Remediation Priority

1. **Fix `InstallSkillCommandWorkflowActions` layer wiring** (blocker) -- this unblocks all skill lifecycle E2E tests
2. **Fix `init --yes` non-interactive agent selection** (blocker) -- this unblocks all E2E tests that use `init --yes` without `--agent`
3. No fixes needed in state command handlers themselves -- they are functionally correct
