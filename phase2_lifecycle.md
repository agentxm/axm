# Phase 2: Smoke Test — Lifecycle Commands (install, uninstall, update)

## Summary

| Command            | Tests Run | Pass  | Fail  | Blocked |
| ------------------ | --------- | ----- | ----- | ------- |
| `skills install`   | 8         | 2     | 1     | 5       |
| `skills uninstall` | 6         | 1     | 1     | 4       |
| `skills update`    | 6         | 6     | 0     | 0       |
| **Total**          | **20**    | **9** | **2** | **9**   |

**Blockers found: 1 systemic (affects install + uninstall), 1 major (affects update)**

---

## 2.1 `skills install` (local source)

### 2.1.1 Help flag

```
Command:  bun run packages/cli/src/main.ts skills install --help
Exit:     0
Result:   PASS
```

Output shows usage with `--all`, `--skill`, `--scope`, `--force`, `--preview`, and correctly omits removed flags (`--list`, `--agent`).

### 2.1.2 Install all from local

```
Command:  cd $TMPDIR && axm init --yes --agent claude-code && axm skills install $FIXTURES --all --yes
Exit:     1
Result:   FAIL — Service not found: InstallSkillCommandWorkflowActions
```

**Full error:**

```
Service not found: InstallSkillCommandWorkflowActions
(defined at packages/cli/src/cli-commands/skills/install/command-actions.ts:162:68)
```

### 2.1.3 Install single skill with --skill

```
Command:  axm skills install $FIXTURES --skill my-skill --yes
Exit:     1
Result:   BLOCKED — same root cause as 2.1.2
```

### 2.1.4 Invalid source /nonexistent

```
Command:  axm skills install /nonexistent --all --yes --non-interactive
Exit:     1
Result:   BLOCKED — same root cause as 2.1.2
```

The error is the service not found error, not the expected "Failed to discover skills" message. Cannot test error handling because the handler never runs.

### 2.1.5 Empty directory

```
Command:  axm skills install $EMPTY_DIR --all --yes --non-interactive
Exit:     1
Result:   BLOCKED — same root cause as 2.1.2
```

### 2.1.6 Preview mode

```
Command:  axm skills install $FIXTURES --all --preview --non-interactive
Exit:     1
Result:   BLOCKED — same root cause as 2.1.2
```

### 2.1.7 Reinstall (idempotent)

```
Result:   BLOCKED — cannot install in first place
```

### 2.1.8 Force reinstall

```
Result:   BLOCKED — cannot install in first place
```

### 2.1.9 Missing required argument

```
Command:  axm skills install --all --yes
Exit:     2
Result:   PASS — shows help text and "Missing required argument: source"
```

---

## 2.2 `skills install` (registry source)

All registry install tests are **BLOCKED** by the same root cause as 2.1.2.

---

## 2.3 `skills uninstall`

### 2.3.1 Help flag

```
Command:  bun run packages/cli/src/main.ts skills uninstall --help
Exit:     0
Result:   PASS
```

Output shows usage with `--yes`, `--preview`, and correctly omits `--agent`.

### 2.3.2 Uninstall installed skill

```
Command:  (after init) axm skills uninstall my-skill --yes
Exit:     1
Result:   FAIL — Service not found: @axm.sh/cli/UninstallSkillCommandWorkflowActions
```

**Full error:**

```
Service not found: @axm.sh/cli/UninstallSkillCommandWorkflowActions
(defined at packages/cli/src/cli-commands/skills/uninstall/command-actions.ts:52:70)
```

### 2.3.3 Uninstall nonexistent

```
Command:  (after init) axm skills uninstall unknown-skill --yes
Exit:     1
Result:   BLOCKED — same root cause as 2.3.2
```

### 2.3.4 Preview mode

```
Command:  (after init) axm skills uninstall my-skill --preview --non-interactive
Exit:     1
Result:   BLOCKED — same root cause as 2.3.2
```

### 2.3.5 Partial uninstall

```
Result:   BLOCKED — cannot install skills, cannot test uninstall
```

### 2.3.6 Uninitialized workspace auto-init

```
Command:  (no init) axm skills uninstall my-skill --yes --non-interactive
Exit:     1
Result:   PARTIAL — auto-init succeeds (.axm/ created with settings.json and axm-lock.yaml)
          but command then fails with missing service error
```

Note: Without `--non-interactive`, using only `--yes` causes the auto-init to hang on the agent selection prompt (multiselect). This is a separate issue — `--yes` does not bypass selection prompts per spec, but auto-init requires agent selection which blocks non-interactive use.

---

## 2.5 `skills update`

### 2.5.1 Help flag

```
Command:  bun run packages/cli/src/main.ts skills update --help
Exit:     0
Result:   PASS
```

Output shows usage with `--scope`, `--agent`, `--skill` flags.

### 2.5.2 No skills installed

```
Command:  (after init) axm skills update --yes
Exit:     0
Result:   PASS
Output:   "No skills installed. Nothing to update."
```

### 2.5.3 Update local source (manually set up state)

```
Command:  (manual state setup) axm skills update --yes
Exit:     0
Result:   PASS — skill updated, lockfile timestamps changed
Output:   "✓ my-skill (Installed my-skill)" / "1 applied"
```

Verified: lockfile `updatedAt` changed from `01:30:00` to `01:35:42`.

**Issue found:** `installedAt` was also overwritten (changed from `01:30:00` to `01:35:42`). Expected behavior: `installedAt` should be preserved from original install, only `updatedAt` should change. This is confirmed by the skipped reconciliation E2E test at `command.e2e.test.ts:866-867` which expects `entry.installedAt` to equal `installedAtBefore` after force reinstall.

### 2.5.4 Preview mode

```
Command:  (2 skills setup) axm skills update --preview --non-interactive
Exit:     0
Result:   PASS
Output:   "Previewing changes..." / "+ another-skill" / "+ my-skill" / "2 to apply"
```

Verified: lockfile `updatedAt` remained unchanged (`01:30:00`). Preview correctly displays the plan without applying.

### 2.5.5 --skill filter

```
Command:  (2 skills setup) axm skills update --skill my-skill --yes
Exit:     0
Result:   PASS — only my-skill updated, another-skill unchanged
Output:   "✓ my-skill (Installed my-skill)" / "1 applied"
```

Verified: `my-skill` lockfile timestamps changed. `another-skill` lockfile timestamps remained at `01:30:00`.

### 2.5.6 Skip disabled skills

```
Command:  (my-skill disabled, another-skill enabled) axm skills update --yes
Exit:     0
Result:   PASS
Output:   "Skipping my-skill (disabled)" / "✓ another-skill (Installed another-skill)"
```

Only enabled skills are updated. Disabled skills are skipped with an info message.

---

## Error Catalog

### INSTALL-1: `skills install` — Missing service layer

- **Command:** `axm skills install <any-source> --all --yes`
- **Expected:** Install handler executes, discovers and installs skills
- **Actual:** Exit 1, `Service not found: InstallSkillCommandWorkflowActions`
- **Root Cause:** `InstallSkillCommandWorkflowActionsLive` layer is defined in `packages/cli/src/cli-commands/skills/install/command-actions.ts:181` but is never provided in the CLI runtime. The command definition at `packages/cli/src/commands/skills/install.ts` calls `withCommandRuntime(handleInstall(...), { workspace: ... })`, and `withCommandRuntime` in `packages/cli/src/command-runtime.ts:148-281` provides `CliFlags`, `Clack`, `Telemetry`, `Workspace`, and `SourceHostProviders` — but NOT `InstallSkillCommandWorkflowActions` or `SkillManager` (which the actions layer depends on). The `SkillManagerLive` layer (`packages/cli/src/extensions/skills/manager.ts:75`) is only imported in test files.
- **Category:** handler (service wiring)
- **Severity:** blocker
- **Scope:** Systemic. Affects ALL install/uninstall commands across extension types:
  - `skills install` — `InstallSkillCommandWorkflowActions`
  - `skills uninstall` — `UninstallSkillCommandWorkflowActions`
  - `packs install` — `InstallPackCommandWorkflowActions` (assumed, same pattern)
  - `packs uninstall` — `UninstallPackCommandWorkflowActions` (assumed)
  - `commands install/uninstall` — same pattern
  - `mcp-servers install/uninstall` — same pattern

### UNINSTALL-1: `skills uninstall` — Missing service layer

- **Command:** `axm skills uninstall my-skill --yes`
- **Expected:** Uninstall handler executes, removes skill
- **Actual:** Exit 1, `Service not found: @axm.sh/cli/UninstallSkillCommandWorkflowActions`
- **Root Cause:** Same as INSTALL-1. `UninstallSkillCommandWorkflowActionsLive` is defined at `packages/cli/src/cli-commands/skills/uninstall/command-actions.ts:69` but never provided in the runtime. Depends on `SkillManager` which is also not provided.
- **Category:** handler (service wiring)
- **Severity:** blocker

### UPDATE-1: `skills update` — `installedAt` timestamp overwritten

- **Command:** `axm skills update --yes` (with pre-existing skill)
- **Expected:** `installedAt` preserved from original install; only `updatedAt` changes
- **Actual:** Both `installedAt` and `updatedAt` set to current time
- **Root Cause:** `sourceToLockEntry()` at `packages/cli/src/sources/source-to-lock-entry.ts:38-42` sets `installedAt: input.now` and `updatedAt: input.now` unconditionally. The update handler at `packages/cli/src/cli-commands/skills/update/handler.ts:486-491` creates a new lock entry via `sourceToLockEntry({ now: new Date() })` without reading the existing `installedAt` value from the lockfile. The `ws.setSkill()` call then overwrites the entire lock entry including `installedAt`.
- **Category:** lockfile
- **Severity:** major
- **Confirmed by:** Skipped E2E test at `install/command.e2e.test.ts:866-867` expects `entry.installedAt` to equal original value after force reinstall.

### UPDATE-2: `skills update` — Holdback warnings never emitted (known)

- **Command:** `axm skills update --yes` (with registry skills + pack constraints)
- **Expected:** Warning when a pack constraint holds back a skill from the latest version
- **Actual:** No holdback warnings emitted
- **Root Cause:** At `packages/cli/src/cli-commands/skills/update/handler.ts:272-283`, `registryRef.version` is passed as both `latestVersion` and `resolvedVersion` to `detectHoldbackWarnings()`. Since both are the same value, the comparison always shows no holdback. The comment at line 272-276 documents this as a known bug: a separate registry query for the latest available version (without constraints) is needed.
- **Category:** handler
- **Severity:** minor (known, documented)

### AUTOINIT-1: `--yes` does not bypass agent selection during auto-init

- **Command:** `axm skills uninstall my-skill --yes` (no prior init, TTY terminal)
- **Expected:** Auto-init with defaults and proceed
- **Actual:** Hangs on agent selection multiselect prompt
- **Root Cause:** Auto-init triggers an agent selection prompt (multiselect). Per spec, `--yes` only auto-accepts yes/no confirmations, not selection prompts. `--non-interactive` is needed to use defaults. The auto-init path should either use sensible defaults when `--yes` is provided (without requiring `--non-interactive`) or the documentation should clarify that `--non-interactive` is needed for headless auto-init.
- **Category:** handler (prompt handling)
- **Severity:** major (blocks CI/scripting without `--non-interactive`)

---

## Root Cause Analysis

### Service Wiring Gap (INSTALL-1, UNINSTALL-1)

The shared extension lifecycle workflow (`packages/cli/src/workflows/install-command/workflow.ts`, `packages/cli/src/workflows/uninstall-command/workflow.ts`) was introduced to canonicalize install/uninstall across extension types (skills, packs, commands, mcp-servers). Each extension type defines:

1. A `*CommandWorkflowActions` service (interface contract)
2. A `*CommandWorkflowActionsLive` layer (implementation capturing dependencies)

The handler resolves the service tag: `const actions = yield* InstallSkillCommandWorkflowActions;`

But the CLI runtime (`withCommandRuntime`) was not updated to provide these new layers. The layers have complex dependencies:

- `InstallSkillCommandWorkflowActionsLive` depends on: `SourceHostProviders`, `Log`, `Spinner`, `SkillManager`, `Workspace`, `Multiselect`, `TextInput`, `Path`, `FileSystem`, `CliFlags`
- `UninstallSkillCommandWorkflowActionsLive` depends on: `Workspace`, `Log`, `SkillManager`
- `SkillManagerLive` depends on: `Workspace`, `FileSystem`, `Path`, `SourceHostProviders`, `Log`, `CliEnvConfig`

The `update` command works because it bypasses the workflow actions pattern entirely — it directly uses `installSkill`/`uninstallSkill` operation functions and `bridgeLegacyPlan`.

### Fix Path

The fix requires providing the workflow action layers in `withCommandRuntime` or per-command. Two approaches:

a) **Per-command layer injection:** Each command definition provides its own actions layer alongside the workspace layer. This keeps commands self-contained but requires modifying each command file.

b) **Registry of extension-type layers:** `withCommandRuntime` accepts an optional layer parameter that commands pass in. This is cleaner but requires API changes to `withCommandRuntime`.

The `SkillManagerLive` must be added first (shared dependency), then the workflow action layers can be provided on top.

---

## Files Examined

### Handler source files

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/install/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/install/command-actions.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/uninstall/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/uninstall/command-actions.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/update/handler.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/extensions/skills/operations/install.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/sources/source-to-lock-entry.ts`

### CLI runtime / wiring

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/command-runtime.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/commands/skills/install.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/commands/skills/uninstall.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/commands/skills/update.ts`

### Schema / workspace

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/settings/schema.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/workspace/service.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/workspace/plan-bridge.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/extensions/skills/manager.ts`

### E2E tests examined

- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/install/command.e2e.test.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/uninstall/command.e2e.test.ts`
- `/Users/craig/Code/agentxm/axm-c/packages/cli/src/cli-commands/skills/update/command.e2e.test.ts`
