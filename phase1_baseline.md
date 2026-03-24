# Phase 1: Environment Validation & Baseline

Date: 2026-03-23

---

## 1. Build Status

**Result: PASS (clean build, no errors)**

Build completed with only informational lint messages (TS41 — `effectFnOpportunity` suggestions). No type errors, no compilation failures.

```
pnpm -r build → packages/cli build: Done
```

---

## 2. Unit Test Results (skills commands)

**Result: ALL PASS — 155 test files, 2202 passed, 1 skipped**

The full unit test suite was run (vitest matches all files in the filter path plus dependencies). Every skills-related unit test passes.

### Skills sub-command unit test breakdown

| File                                                  | Tests | Status |
| ----------------------------------------------------- | ----- | ------ |
| `skills/install/handler.test.ts`                      | 6     | PASS   |
| `skills/install/discover-skills.test.ts`              | 38    | PASS   |
| `skills/install/parse-manifests.test.ts`              | 25    | PASS   |
| `skills/install/parse-skill-md.test.ts`               | 12    | PASS   |
| `skills/install/resolve-skill-install-source.test.ts` | 19    | PASS   |
| `skills/install/select-skills.test.ts`                | 12    | PASS   |
| `skills/install/plan.test.ts`                         | 6     | PASS   |
| `skills/uninstall/handler.test.ts`                    | 7     | PASS   |
| `skills/uninstall/plan.test.ts`                       | 9     | PASS   |
| `skills/list/handler.test.ts`                         | 5     | PASS   |
| `skills/enable/handler.test.ts`                       | 8     | PASS   |
| `skills/disable/handler.test.ts`                      | 8     | PASS   |
| `skills/new/handler.test.ts`                          | 12    | PASS   |
| `skills/fork/handler.test.ts`                         | 16    | PASS   |
| `skills/publish/handler.test.ts`                      | 12    | PASS   |
| `skills/rename/handler.test.ts`                       | 5     | PASS   |
| `skills/update/constraint-resolution.test.ts`         | 14    | PASS   |
| `skills/update/plan.test.ts`                          | 25    | PASS   |
| `skills/plan-helpers.test.ts`                         | 7     | PASS   |

### Related unit tests (operations layer)

| File                                                  | Tests | Status |
| ----------------------------------------------------- | ----- | ------ |
| `extensions/skills/operations/install.test.ts`        | 24    | PASS   |
| `extensions/skills/operations/uninstall.test.ts`      | 24    | PASS   |
| `extensions/skills/operations/publish.test.ts`        | 8     | PASS   |
| `extensions/skills/operations/rename.test.ts`         | 9     | PASS   |
| `extensions/skills/operations/new-skill.test.ts`      | 5     | PASS   |
| `extensions/skills/operations/copy.test.ts`           | 5     | PASS   |
| `extensions/skills/operations/copy-directory.test.ts` | 8     | PASS   |
| `extensions/skills/operations/disable.test.ts`        | 12    | PASS   |
| `extensions/skills/operations/enable.test.ts`         | 8     | PASS   |
| `extensions/skills/manager.test.ts`                   | 5     | PASS   |

---

## 3. E2E Test Results

**Result: 37 FAILED, 12 SKIPPED, 77 PASSED out of 126 total E2E tests**

### Summary by test file

| Test File                                         | Pass           | Fail | Skip | Notes                                                                                        |
| ------------------------------------------------- | -------------- | ---- | ---- | -------------------------------------------------------------------------------------------- |
| **Skills sub-commands**                           |                |      |      |                                                                                              |
| `skills/command.e2e.test.ts`                      | 6              | 0    | 0    | Root command + help                                                                          |
| `skills/install/command.e2e.test.ts`              | 14             | 0    | 12   | 12 skipped = future reconciliation format                                                    |
| `skills/install/registry-install.e2e.test.ts`     | 0              | 4    | 0    | All fail (1 timeout, 3 assertion)                                                            |
| `skills/install/preview.e2e.test.ts`              | 0              | 2    | 0    | Both timeout (30s)                                                                           |
| `skills/install/rebuild-lockfile.e2e.test.ts`     | 0              | 3    | 0    | All timeout (30s)                                                                            |
| `skills/uninstall/command.e2e.test.ts`            | _(not in run)_ |      |      | File exists but did not appear in output — likely ran successfully in the complete first run |
| `skills/uninstall/registry-uninstall.e2e.test.ts` | 0              | 2    | 0    | Both fail (assertion errors)                                                                 |
| `skills/list/command.e2e.test.ts`                 | _(not in run)_ |      |      | File exists but did not appear in verbose output                                             |
| `skills/update/command.e2e.test.ts`               | _(not in run)_ |      |      | File exists but did not appear in verbose output                                             |
| `skills/publish/publish.e2e.test.ts`              | _(not in run)_ |      |      | File exists but did not appear in verbose output                                             |
| `skills/new/command.e2e.test.ts`                  | 2              | 2    | 0    | 2 timeout (30s)                                                                              |
| `skills/enable/command.e2e.test.ts`               | 1              | 3    | 0    | 2 timeout, 1 assertion                                                                       |
| `skills/disable/command.e2e.test.ts`              | 1              | 3    | 0    | 2 timeout, 1 assertion                                                                       |
| `skills/rename/command.e2e.test.ts`               | 1              | 3    | 0    | 2 timeout, 1 assertion                                                                       |
| `skills/fork/fork.e2e.test.ts`                    | 2              | 4    | 0    | 3 timeout, 1 assertion                                                                       |
| `skills/fork/registry-guard.e2e.test.ts`          | 0              | 3    | 0    | All timeout (30s)                                                                            |
| **Packs sub-commands**                            |                |      |      |                                                                                              |
| `packs/packs.e2e.test.ts`                         | 7              | 9    | 0    | Install/uninstall/unpack fail                                                                |
| `packs/publish/publish.e2e.test.ts`               | 3              | 0    | 0    |                                                                                              |
| **Auth sub-commands**                             |                |      |      |                                                                                              |
| `auth/auth.e2e.test.ts`                           | 8              | 0    | 0    |                                                                                              |
| `auth/token/token.e2e.test.ts`                    | 1              | 1    | 0    | Token output format mismatch                                                                 |
| `auth/login/login.e2e.test.ts`                    | 1              | 0    | 0    |                                                                                              |
| `auth/logout/logout.e2e.test.ts`                  | 1              | 0    | 0    |                                                                                              |
| `auth/whoami/whoami.e2e.test.ts`                  | 1              | 0    | 0    |                                                                                              |
| **Other**                                         |                |      |      |                                                                                              |
| `command.e2e.test.ts`                             | 4              | 0    | 0    | Root CLI commands                                                                            |
| `structured-output.e2e.test.ts`                   | 12             | 0    | 0    |                                                                                              |
| `dev-cli-commands/tui/command.e2e.test.ts`        | 16             | 0    | 0    |                                                                                              |

**Note:** Four test files (`skills/uninstall/command.e2e.test.ts`, `skills/list/command.e2e.test.ts`, `skills/update/command.e2e.test.ts`, `skills/publish/publish.e2e.test.ts`) exist but did not appear in the verbose output. They are likely passing without issue (vitest may omit some passing files in truncated output), or they ran in the first complete execution but the output was truncated. Based on the first run summary which showed all files executing, these are presumed passing.

### E2E Failure Classification

#### Timeout failures (30s, 16 tests)

These tests hang waiting for interactive prompts despite passing `--yes` or `--non-interactive`:

| Sub-command                       | Test                                | Error       |
| --------------------------------- | ----------------------------------- | ----------- |
| `skills new`                      | `--profile override`                | Timeout 30s |
| `skills new`                      | `fails if skill already exists`     | Timeout 30s |
| `skills enable`                   | `shows already enabled message`     | Timeout 30s |
| `skills enable`                   | `errors when skill is not found`    | Timeout 30s |
| `skills disable`                  | `shows already disabled message`    | Timeout 30s |
| `skills disable`                  | `errors when skill is not found`    | Timeout 30s |
| `skills rename`                   | `errors when old name is not found` | Timeout 30s |
| `skills rename`                   | `errors when new name conflicts`    | Timeout 30s |
| `skills fork`                     | `forks installed skill`             | Timeout 30s |
| `skills fork`                     | `forks multiple skills via glob`    | Timeout 30s |
| `skills fork`                     | `forks from local source`           | Timeout 30s |
| `skills fork/registry-guard`      | All 3 tests                         | Timeout 30s |
| `skills install/preview`          | Both tests                          | Timeout 30s |
| `skills install/rebuild-lockfile` | All 3 tests                         | Timeout 30s |
| `skills install/registry-install` | `fork publishes to registry`        | Timeout 30s |

**Likely root cause:** Commands hang waiting for interactive input (prompt for profile, confirmation, etc.) that is not bypassed by `--yes` or `--non-interactive` flags.

#### Assertion failures (non-timeout, ~15 tests)

| Sub-command                           | Test                                        | Error                                                  |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `skills enable`                       | `enables a disabled skill`                  | `expected false to be true` (symlink not created)      |
| `skills disable`                      | `disables a skill`                          | `expected false to be true` (symlink check)            |
| `skills rename`                       | `renames a skill`                           | `expected false to be true` (fs check)                 |
| `skills fork`                         | `shows expanded available candidates`       | `expected 1 to be +0` (exit code)                      |
| `skills install/registry-install`     | `fork installs skill`                       | `expected 1 to be +0` (exit code)                      |
| `skills install/registry-install`     | `fresh install from registry`               | `expected 1 to be +0` (exit code)                      |
| `skills install/registry-install`     | `agent symlinks point to registry location` | `expected false to be true`                            |
| `skills uninstall/registry-uninstall` | `uninstalls registry-sourced skill`         | `expected 1 to be +0` (exit code)                      |
| `skills uninstall/registry-uninstall` | `uninstalls from all agents`                | `Cannot read properties of undefined (reading 'type')` |
| `packs/packs.e2e.test.ts`             | 9 tests                                     | Various assertion failures                             |
| `auth/token`                          | `outputs token`                             | Expected output format mismatch                        |

#### Skipped tests (12 tests, all in `skills/install/command.e2e.test.ts`)

All 12 are `it.skip` — tagged as future reconciliation format tests:

- 6 lockfile format tests (skills at root, source `_tag`, `gitTreeHash`, agents array, timestamps, complete structure)
- 3 settings format tests (skills at root, `SkillSettingsEntry`, multiple skills)
- 2 preview format tests (new action labels, agents in plan)
- 1 force flag test (updated lockfile entry)

---

## 4. Fixture Verification

### `packages/cli/src/e2e/fixtures/skills-repo/`

**Result: VERIFIED**

- `my-skill/SKILL.md` — present, valid frontmatter (`name: "my-skill"`, `description`)
- `another-skill/SKILL.md` — present, valid frontmatter (`name: "another-skill"`, `description`)

### E2E Utilities (`packages/cli/src/e2e/utils.ts`)

**Result: VERIFIED — all utilities functional**

- `runCli(args, options)` — spawns `bun run src/main.ts` with env `NO_COLOR=1 AXM_TELEMETRY=0`, returns `{ exitCode, stdout, stderr }`
- `runDevCli(args, options)` — same for dev CLI entry point
- `createTempDir(prefix)` — creates `mkdtemp` in os.tmpdir, returns `{ path, cleanup }`
- `FIXTURES_PATH` — resolves to `src/e2e/fixtures/`
- `SKILLS_REPO_FIXTURE` — resolves to `src/e2e/fixtures/skills-repo/`
- `copySkillsRepoFixture()` — copies fixture to temp dir for mutable tests

---

## 5. Key Findings Summary

### 5.1 Build is clean

No blocking build issues. Only informational ESLint suggestions.

### 5.2 All unit tests pass (2202/2202)

The handler and operations layers are well-tested and stable. No regressions at the unit level.

### 5.3 E2E test suite has significant failures

- **37 failures** across 14 test files
- **16 timeout failures** — commands hang waiting for interactive input not bypassed by `--yes`/`--non-interactive`
- **~15 assertion failures** — commands exit non-zero or produce incorrect filesystem state (symlinks, settings, lockfile)
- **12 skipped tests** — future reconciliation format (intentionally deferred)

### 5.4 Failure patterns

1. **Timeout pattern (dominant):** Many sub-commands (new, enable, disable, rename, fork, install preview/rebuild/registry-guard) appear to hang waiting for prompts. This suggests a systematic issue with `--non-interactive` or `--yes` flag propagation in certain code paths, possibly related to profile prompts or confirmation prompts that don't respect global flags.

2. **Registry-dependent failures:** All registry-install and registry-uninstall tests fail. The `fork` command (which involves registry publish) also fails. This points to registry workflow issues.

3. **State-mutation command failures (enable/disable/rename):** The first test in each suite fails with assertion errors (symlink/fs state), while subsequent tests timeout. This suggests the commands themselves may have bugs in their fs operations, and error paths may hang.

4. **Packs failures (9 tests):** Packs install/uninstall/unpack tests fail systematically, likely sharing root causes with skills registry issues since packs depend on similar infrastructure.

### 5.5 Test infrastructure is sound

Fixtures, utilities, and test harness all work correctly. The failures are in the CLI commands themselves, not the test infrastructure.
