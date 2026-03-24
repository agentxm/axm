# Skills Remediation Discovery Plan

Phased plan to smoke test each `axm skills` sub-command using a local registry, identify errors, determine root causes, and produce a cohesive remediation plan.

## Overview

**10 sub-commands** to test:
`install`, `uninstall`, `list`, `enable`, `disable`, `new`, `fork`, `publish`, `rename`, `update`

**Testing approach:** Run each sub-command as a CLI subprocess (matching E2E test patterns), using `file://` local registry for registry-dependent commands. Capture exit codes, stdout, stderr. Compare actual behavior against spec and existing E2E test expectations.

**Existing test coverage:** 20 E2E test files, 15 unit test files across all sub-commands.

---

## Phase 1: Environment Validation & Baseline

**Goal:** Confirm the CLI builds, the test infrastructure works, and establish a baseline.

### Steps

1. **Build the CLI**

   ```
   pnpm build
   ```

   Verify clean build with no errors.

2. **Run existing E2E test suite**

   ```
   pnpm test:e2e -- --reporter=verbose 2>&1 | tee e2e-baseline.log
   ```

   Capture full output. Categorize results:
   - Passing tests (green baseline)
   - Failing tests (pre-existing issues)
   - Skipped tests (`.skip` — known future work)

3. **Run existing unit test suite for skills**

   ```
   pnpm test -- packages/cli/src/cli-commands/skills/ --reporter=verbose
   ```

4. **Verify test fixtures**
   - Confirm `packages/cli/src/e2e/fixtures/skills-repo/` has `my-skill/SKILL.md` and `another-skill/SKILL.md`
   - Confirm `runCli`, `createTempDir`, `SKILLS_REPO_FIXTURE` utilities are functional

### Deliverable

- `phase1_baseline.md`: Test results summary — pass/fail/skip counts per sub-command, any build errors

---

## Phase 2: Smoke Test — Lifecycle Commands (install, uninstall, update)

**Goal:** Test the core skill lifecycle using local sources and local registry.

### 2.1 `skills install` (local source)

| Test                   | Command                                                          | Expected                                                                               |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Help flag              | `axm skills install --help`                                      | Exit 0, shows usage with `--all`, `--skill`, `--scope`, `--force`, `--preview`         |
| Install all from local | `axm skills install <fixture> --all --yes`                       | Exit 0, skills in `.axm/extensions/external/skills/`, lockfile entries, agent symlinks |
| Install single skill   | `axm skills install <fixture> --skill my-skill --yes`            | Exit 0, only `my-skill` installed                                                      |
| Invalid source         | `axm skills install /nonexistent --all --yes`                    | Exit non-zero, stderr contains "Failed to discover skills"                             |
| Empty directory        | `axm skills install <empty-dir> --all --yes`                     | Exit non-zero, stderr contains "No skills found"                                       |
| Preview mode           | `axm skills install <fixture> --all --preview --non-interactive` | Exit 0, shows plan, no files created                                                   |
| Reinstall (idempotent) | Install twice without `--force`                                  | Exit 0, shows "already up to date" or reinstalls                                       |
| Force reinstall        | Install twice with `--force`                                     | Exit 0, skill reinstalled                                                              |

### 2.2 `skills install` (registry source)

| Test                          | Command                                          | Expected                                                                                |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Install from registry ref     | `axm skills install @test/skills/my-skill --yes` | Exit 0, registry lockfile entry with `type: "registry"`, `resolvedVersion`, `integrity` |
| Registry install has manifest | Verify post-install                              | `axm-skill.json` at extension root, content in `src/`                                   |

**Prerequisite:** Publish a skill to local `file://` registry first (via fork or manual setup).

### 2.3 `skills uninstall`

| Test                      | Command                                                     | Expected                                                                                       |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Help flag                 | `axm skills uninstall --help`                               | Exit 0, shows usage                                                                            |
| Uninstall installed skill | `axm skills uninstall my-skill --yes`                       | Exit 0, canonical dir removed, symlink removed, lockfile entry removed, settings entry removed |
| Uninstall nonexistent     | `axm skills uninstall unknown --yes`                        | Exit 0, "not installed" message                                                                |
| Preview mode              | `axm skills uninstall my-skill --preview --non-interactive` | Exit 0, shows plan, no files changed                                                           |
| Partial uninstall         | Install 2, uninstall 1                                      | Other skill remains intact                                                                     |
| Uninitialized workspace   | `axm skills uninstall my-skill --yes` (no init)             | Exit 0, auto-init, "not installed"                                                             |

### 2.4 `skills uninstall` (registry-sourced)

| Test                     | Command              | Expected                                                                                             |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Uninstall registry skill | Fork, then uninstall | `.axm/extensions/@test/skills/my-skill` removed, lockfile cleared, settings cleared, symlink removed |

### 2.5 `skills update`

| Test                 | Command                                         | Expected                                 |
| -------------------- | ----------------------------------------------- | ---------------------------------------- |
| Help flag            | `axm skills update --help`                      | Exit 0, shows usage                      |
| No skills installed  | `axm skills update --yes`                       | Exit 0, "no skills installed"            |
| Update local source  | Install, wait, update                           | Exit 0, `updatedAt` timestamp changes    |
| Preview mode         | `axm skills update --preview --non-interactive` | Exit 0, shows plan, lockfile unchanged   |
| Skip disabled skills | Disable one, update                             | Skipped message for disabled skill       |
| `--skill` filter     | `axm skills update --skill my-skill --yes`      | Only `my-skill` updated, other unchanged |

### Error Catalog Template

For each failure found, record:

```
### ERROR-ID: <COMMAND>-<N>
- **Command:** <exact command>
- **Expected:** <expected behavior>
- **Actual:** <actual behavior — exit code, output>
- **Root Cause:** <analysis>
- **Category:** [parse|handler|plan|lockfile|settings|symlink|registry]
- **Severity:** [blocker|major|minor]
```

### Deliverable

- `phase2_lifecycle.md`: Smoke test results, error catalog entries

---

## Phase 3: Smoke Test — State Commands (list, enable, disable, rename)

**Goal:** Test commands that query or modify skill state without installing/removing.

### 3.1 `skills list`

| Test                       | Command                      | Expected                                           |
| -------------------------- | ---------------------------- | -------------------------------------------------- |
| Help flag                  | `axm skills list --help`     | Exit 0                                             |
| After init (builtins only) | `axm skills list`            | Exit 0, shows `axm-manage-skills`, `builtin` label |
| With installed skills      | Install, then list           | Shows `my-skill`, `another-skill`                  |
| After partial uninstall    | Install 2, uninstall 1, list | Shows only remaining                               |
| `ls` alias                 | `axm skills ls`              | Same as `list`                                     |

### 3.2 `skills enable`

| Test                  | Command                               | Expected                                                |
| --------------------- | ------------------------------------- | ------------------------------------------------------- |
| Help flag             | `axm skills enable --help`            | Exit 0                                                  |
| Enable disabled skill | Disable, then enable                  | Exit 0, symlinks restored, settings `enabled` not false |
| Already enabled       | Enable without disabling              | Exit 0, "already enabled"                               |
| Nonexistent skill     | `axm skills enable nonexistent --yes` | Exit non-zero, "is not installed"                       |

### 3.3 `skills disable`

| Test                    | Command                                | Expected                                                                                    |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Help flag               | `axm skills disable --help`            | Exit 0                                                                                      |
| Disable installed skill | `axm skills disable my-skill --yes`    | Exit 0, symlinks removed, canonical preserved, settings `enabled: false`, lockfile retained |
| Already disabled        | Disable twice                          | Exit 0, "already disabled"                                                                  |
| Nonexistent skill       | `axm skills disable nonexistent --yes` | Exit non-zero, "is not installed"                                                           |

### 3.4 `skills rename`

| Test                   | Command                                     | Expected                                                                                           |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Help flag              | `axm skills rename --help`                  | Exit 0                                                                                             |
| Rename installed skill | `axm skills rename my-skill new-name --yes` | Exit 0, old dir gone, new dir exists, settings key changed, lockfile key changed, symlinks updated |
| Nonexistent source     | `axm skills rename nonexistent new --yes`   | Exit non-zero, "not found"                                                                         |
| Conflict with existing | Rename to name that exists                  | Exit non-zero, "already exists"                                                                    |

### Deliverable

- `phase3_state.md`: Smoke test results, error catalog entries

---

## Phase 4: Smoke Test — Registry Commands (new, fork, publish)

**Goal:** Test commands that interact with the extension/registry system.

### 4.1 `skills new`

| Test               | Command                                                     | Expected                                                                         |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Help flag          | `axm skills new --help`                                     | Exit 0                                                                           |
| Scaffold new skill | `axm skills new my-skill --yes` (with namespace configured) | Exit 0, `axm-skill.json` manifest, `src/SKILL.md`, settings entry, agent symlink |
| Namespace override | `axm skills new my-skill --namespace @custom --yes`         | Manifest has `@custom` namespace                                                 |
| Already exists     | Create twice                                                | Exit non-zero, "already exists"                                                  |
| Agent narrowing    | `axm skills new narrow --agent claude-code --yes`           | Symlink only for specified agent                                                 |

### 4.2 `skills fork`

| Test                      | Command                              | Expected                                                                                                                              |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Help flag                 | `axm skills fork --help`             | Exit 0                                                                                                                                |
| Fork installed skill      | Install, configure registry, fork    | Exit 0, extension in `.axm/extensions/@test/skills/`, published to registry, lockfile updated to `type: "registry"`, settings updated |
| Fork from local source    | `axm skills fork <fixture> --yes`    | Exit 0, skills forked from source directory                                                                                           |
| Glob pattern              | `axm skills fork "*-skill" --yes`    | Multiple skills forked                                                                                                                |
| On-disk skills            | Fork unmanaged skills from agent dir | Exit 0, creates managed extensions                                                                                                    |
| No-match glob             | `axm skills fork "zzz-*" --yes`      | Exit non-zero, "Available:" lists candidates                                                                                          |
| Registry guard (built-in) | Fork without explicit registry       | Exit 0, uses built-in registry                                                                                                        |

### 4.3 `skills publish`

| Test                                | Command                                      | Expected                                                                |
| ----------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Help flag                           | `axm skills publish --help`                  | Exit 0                                                                  |
| Publish to local registry           | Create extension, publish                    | Exit 0, `index.json` in registry, archive `.zip` with valid magic bytes |
| Bare name (namespace from settings) | `axm skills publish code-review --yes`       | Resolves namespace, publishes correctly                                 |
| Nonexistent extension               | `axm skills publish @test/skills/nope --yes` | Exit non-zero, "not found"                                              |
| Glob pattern                        | `axm skills publish "effect-*" --yes`        | Only matching skills published                                          |
| Multiple literal names              | `axm skills publish a b --yes`               | Both published                                                          |
| No-match glob                       | `axm skills publish "nonexistent-*" --yes`   | Exit 0, "no skills matched"                                             |
| Registry guard                      | Publish without registry configured          | Exit non-zero, error mentions "registry"                                |

### Deliverable

- `phase4_registry.md`: Smoke test results, error catalog entries

---

## Phase 5: Smoke Test — Cross-Cutting Flows

**Goal:** Test multi-command workflows and edge cases that span sub-commands.

### 5.1 Full lifecycle flow

```
init → install (local) → list → disable → update (verify skip) → enable → rename → uninstall → list (verify gone)
```

### 5.2 Registry lifecycle flow

```
init → install (local) → fork (to registry) → uninstall → install (from registry) → update → uninstall
```

### 5.3 Edge cases

| Test                  | Scenario                                                          | Expected                               |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| Root `skills` command | `axm skills` (no subcommand)                                      | Exit 0, shows help                     |
| `--help` on root      | `axm skills --help`                                               | Exit 0, shows subcommands, examples    |
| Global flags          | `--non-interactive`, `--yes`, `--force`, `--preview` propagation  | Each behaves per spec                  |
| Concurrent agents     | Init with multiple agents, install, verify all symlinks           | Symlinks for each agent                |
| Lockfile integrity    | After full lifecycle, lockfile is valid YAML with expected schema | `lockfileVersion: 1`, proper entries   |
| Settings integrity    | After full lifecycle, settings.json is valid JSON                 | Proper skill entries, agents preserved |

### 5.4 Known Issues to Verify

| Issue                                     | Location                                        | Status                                                                |
| ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Update holdback warnings never emitted    | `update/handler.ts:272-276`                     | Known bug — `registryRef.version` passed for both latest and resolved |
| HTTP(S) registry discovery not supported  | `fork/handler.ts:99-101`                        | Known limitation                                                      |
| Skipped E2E tests (reconciliation format) | `install/command.e2e.test.ts` — 8 `.skip` tests | Future format changes                                                 |

### Deliverable

- `phase5_crosscutting.md`: Workflow test results, edge case results, known issue verification

---

## Phase 6: Root Cause Analysis & Error Classification

**Goal:** Analyze all errors found in Phases 2-5, determine root causes, and classify.

### Classification Dimensions

**By component:**

- CLI parser / argument handling
- Handler logic / business logic
- Plan building / plan resolution
- Lockfile read/write
- Settings read/write
- Filesystem operations (copy, symlink, rename)
- Registry operations (publish, fetch, resolve)

**By severity:**

- **Blocker:** Command crashes or produces corrupt state
- **Major:** Command succeeds but produces wrong result or missing output
- **Minor:** Cosmetic issues, suboptimal error messages, edge case gaps

**By root cause pattern:**

- Schema mismatch (lockfile/settings format drift)
- Missing error mapping (untyped errors leaking)
- Race condition / ordering issue
- Missing validation at boundary
- Incorrect plan action construction
- Registry protocol issue

### Deliverable

- `phase6_rca.md`: Error classification matrix, root cause patterns, dependency graph between errors

---

## Phase 7: Remediation Plan Synthesis

**Goal:** Produce a single, cohesive `skills_remediation_plan.md` that consolidates all findings into an efficient, ordered remediation strategy.

### Synthesis Process

1. **Deduplicate:** Merge errors that share the same root cause into single remediation items
2. **Order by dependency:** Fix foundational issues first (e.g., schema/lockfile before commands that depend on them)
3. **Group by component:** Batch related fixes to minimize context switching
4. **Prioritize by severity:** Blockers first, then majors, then minors
5. **Identify shared fixes:** A single fix in a shared module (e.g., plan-helpers, lockfile writer) may resolve multiple command-level errors
6. **Estimate scope:** For each remediation item, note affected files and whether it's a code fix, test fix, or both
7. **Validate coherence:** Ensure no remediation item contradicts another; verify the fix order is acyclic
8. **Ensure consistency:** All fixes follow the same patterns (Effect conventions, CliError codes, testing style)

### Output Structure

```markdown
# Skills Remediation Plan

## Summary

- Total errors found: N
- Blockers: N | Major: N | Minor: N
- Unique root causes: N
- Estimated remediation items: N

## Remediation Order

### 1. <Title> [blocker|major|minor]

- **Errors resolved:** ERROR-ID-1, ERROR-ID-2
- **Root cause:** <description>
- **Fix:** <what to change>
- **Files:** <list of files>
- **Tests:** <new or updated tests>
- **Depends on:** (none | item N)

### 2. ...

## Verification Checklist

- [ ] All E2E tests pass (existing + new)
- [ ] All unit tests pass
- [ ] No skipped tests re-broken
- [ ] Full lifecycle flow (Phase 5.1) passes
- [ ] Registry lifecycle flow (Phase 5.2) passes
- [ ] Build clean, typecheck clean, lint clean
```

### Quality Gates

Before finalizing `skills_remediation_plan.md`:

- [ ] Every error from Phases 2-5 is accounted for (mapped to a remediation item or explicitly deferred with rationale)
- [ ] No circular dependencies in remediation order
- [ ] Shared fixes are identified (not duplicated across items)
- [ ] Each item has clear acceptance criteria
- [ ] Plan is executable in order — each item leaves the codebase in a valid state
- [ ] Known issues (holdback bug, HTTP registry) are documented with defer/fix decision
- [ ] Skipped tests (`.skip`) are reviewed — include in plan if appropriate, or document why deferred

### Deliverable

- `skills_remediation_plan.md`: The final, consolidated remediation plan
