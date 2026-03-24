# Phase 6: Root Cause Analysis & Error Classification

## Summary

| Metric                          | Count                                           |
| ------------------------------- | ----------------------------------------------- |
| Total errors found (Phases 2-4) | 8                                               |
| Blockers                        | 1 (affects 8 commands across 4 extension types) |
| Major                           | 5                                               |
| Minor                           | 2                                               |
| Unique root causes              | 6                                               |
| Shared root causes              | 2                                               |

---

## Error Classification Matrix

### 1. INSTALL-1 / UNINSTALL-1: Missing Service Layer Wiring [blocker]

**Component:** CLI runtime / service wiring
**Severity:** Blocker
**Root cause pattern:** Missing service wiring
**Affected commands:** All 8 install/uninstall commands across 4 extension types

#### Root Cause (verified)

The `withCommandRuntime()` function in `command-runtime.ts` (lines 170-281) provides:

- `CliFlags`, `Clack`, `Telemetry` (always)
- `Workspace`, `SourceHostProviders` (when `workspace` option is passed)

It does NOT provide:

- `InstallSkillCommandWorkflowActions` (needed by `skills install`)
- `UninstallSkillCommandWorkflowActions` (needed by `skills uninstall`)
- `SkillManager` (dependency of both workflow action layers)
- Equivalent services for packs, commands, mcp-servers

Each handler yields its respective `*CommandWorkflowActions` service (e.g., `handler.ts:50: const actions = yield* InstallSkillCommandWorkflowActions`), which requires the corresponding `*Live` layer. These layers are defined (e.g., `InstallSkillCommandWorkflowActionsLive`) but never provided anywhere in the production runtime chain. They are only used in test files where they are manually provided.

#### Exact code locations

| File                                                             | Line    | Issue                                                                    |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| `packages/cli/src/command-runtime.ts`                            | 213-218 | `commandLayer` missing extension manager layers                          |
| `packages/cli/src/cli-commands/skills/install/handler.ts`        | 50      | `yield* InstallSkillCommandWorkflowActions` — service not provided       |
| `packages/cli/src/cli-commands/skills/uninstall/handler.ts`      | 37      | `yield* UninstallSkillCommandWorkflowActions` — service not provided     |
| `packages/cli/src/cli-commands/packs/install/handler.ts`         | 29      | `yield* InstallPackCommandWorkflowActions` — service not provided        |
| `packages/cli/src/cli-commands/packs/uninstall/handler.ts`       | 29      | `yield* UninstallPackCommandWorkflowActions` — service not provided      |
| `packages/cli/src/cli-commands/commands/install/handler.ts`      | 28      | `yield* InstallCommandCommandWorkflowActions` — service not provided     |
| `packages/cli/src/cli-commands/commands/uninstall/handler.ts`    | 28      | `yield* UninstallCommandCommandWorkflowActions` — service not provided   |
| `packages/cli/src/cli-commands/mcp-servers/install/handler.ts`   | 28      | `yield* InstallMcpServerCommandWorkflowActions` — service not provided   |
| `packages/cli/src/cli-commands/mcp-servers/uninstall/handler.ts` | 28      | `yield* UninstallMcpServerCommandWorkflowActions` — service not provided |

#### Dependency chain

To provide `InstallSkillCommandWorkflowActionsLive`, you need:

1. `SkillManager` (via `SkillManagerLive`) — depends on `Workspace`, `FileSystem`, `Path`, `CliEnvConfig`, `SourceHostProviders`
2. `SourceHostProviders` — already provided by `withCommandRuntime`
3. `Workspace` — already provided by `withCommandRuntime`
4. `CliFlags` — already provided by `withCommandRuntime`
5. All Clack services (`Log`, `Spinner`, `Multiselect`, `TextInput`) — already provided by `withCommandRuntime`

Similar chains exist for packs (needs `PackManager` + `SkillManager` + `CommandManager` + `McpServerManager`), commands (needs `CommandManager`), and mcp-servers (needs `McpServerManager`).

---

### 2. UPDATE-1: `installedAt` Overwritten on Update [major]

**Component:** Lockfile R/W
**Severity:** Major
**Root cause pattern:** Missing state preservation in lockfile write path

#### Root Cause (verified)

`sourceToLockEntry()` in `packages/cli/src/sources/source-to-lock-entry.ts` (lines 38-42) always sets both `installedAt` and `updatedAt` to `input.now`:

```typescript
const commonFields = (input: SourceToLockEntryInput) => ({
  agents: [...input.agents],
  installedAt: input.now, // <-- should preserve original on update
  updatedAt: input.now,
});
```

The function has no input for an existing lock entry's `installedAt`. Every caller — `installSkill` (install.ts:486-491), `buildSkillLockEntry` (manager.ts:63-69) — passes a fresh `Date()`. During `skills update`, this overwrites the original `installedAt`.

#### Fix approach

Add optional `existingInstalledAt: Option<Date>` to `SourceToLockEntryInput`. When present, use it for `installedAt` instead of `input.now`. Update callers to pass the existing entry's `installedAt` when performing updates.

#### Exact code locations

| File                                                       | Line    | Issue                                                  |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------ |
| `packages/cli/src/sources/source-to-lock-entry.ts`         | 38-42   | `commonFields` always sets `installedAt: input.now`    |
| `packages/cli/src/extensions/skills/operations/install.ts` | 486-491 | Caller passes `now: new Date()` without existing entry |
| `packages/cli/src/extensions/skills/manager.ts`            | 63-69   | Same issue                                             |

---

### 3. UPDATE-2: Holdback Warnings Never Emitted [minor]

**Component:** Handler logic
**Severity:** Minor (known, documented in code)
**Root cause pattern:** Incorrect data flow — same version passed for both parameters

#### Root Cause (verified)

In `packages/cli/src/cli-commands/skills/update/handler.ts` (lines 272-283), `detectHoldbackWarnings` is called with `registryRef.version` for both the `latestVersion` and `resolvedVersion` parameters:

```typescript
return detectHoldbackWarnings(
  registryRef.version, // <-- latestVersion
  registryRef.version, // <-- resolvedVersion (same value!)
  constraints,
  skillFqn,
);
```

`detectHoldbackWarnings` compares `latestVersion` vs `resolvedVersion` to detect when a pack constraint holds back a skill. Since both are the same value, it always concludes no holdback occurred.

The `TODO` comment at lines 272-276 already documents this bug. A fix requires a separate registry query for the latest unconstrained version, which the current resolution flow does not support.

#### Exact code locations

| File                                                     | Line    | Issue                               |
| -------------------------------------------------------- | ------- | ----------------------------------- |
| `packages/cli/src/cli-commands/skills/update/handler.ts` | 277-280 | Same version passed for both params |

---

### 4. AUTOINIT-1: Agent Selection Prompt Blocks `--yes` Auto-Init [major]

**Component:** Handler logic / workspace initialization
**Severity:** Major
**Root cause pattern:** Missing flag handling in auto-init path

#### Root Cause (verified)

In `packages/cli/src/workspace/initialization.ts` (lines 72-97), the agent selection decision tree only checks `flags.nonInteractive`:

```typescript
if (flags.nonInteractive) {
  selectedAgents = detectedAgents;  // auto-select
} else {
  // Interactive mode — shows multiselect prompt
  const selectedIds = yield* prompt.multiselect<string>({ ... });
}
```

When `--yes` is passed without `--non-interactive` in an interactive terminal (TTY), `nonInteractive` is `false` (per the resolution chain: explicit flag > `CI=true` > `!stdin.isTTY`). The multiselect prompt appears even though the user expects `--yes` to complete the command without interaction.

Per CLAUDE.md spec, `--yes` only auto-accepts yes/no confirmations, not selection prompts. However, the auto-init agent selection is a UX problem because:

1. Users running `axm skills install ./foo --yes` don't expect to be asked about agents
2. The auto-init is implicit (triggered by the install command when workspace is missing)
3. There's no way to pre-select agents via a flag on the install command

In non-TTY/CI environments, `isInteractive()` returns `false`, so `nonInteractive` resolves to `true` and the prompt is skipped. The issue only manifests in interactive terminals with `--yes`.

#### Fix approach

Option A: When auto-init is triggered implicitly (not via `axm init`), skip agent selection and auto-detect — regardless of `--yes`. This means adding a flag to `WorkspaceContextOptions` to indicate "auto-init" vs "explicit init".

Option B: Check `flags.yes` in addition to `flags.nonInteractive` and auto-select detected agents for both.

#### Exact code locations

| File                                           | Line  | Issue                                               |
| ---------------------------------------------- | ----- | --------------------------------------------------- |
| `packages/cli/src/workspace/initialization.ts` | 73-97 | Only checks `nonInteractive`, not `yes`             |
| `packages/cli/src/commands/skills/install.ts`  | 33    | Passes `agents: Option.none()` — no explicit agents |

---

### 5. FORK-1: Lockfile `integrity` Always Empty [major]

**Component:** Plan building / fork handler
**Severity:** Major
**Root cause pattern:** Incorrect plan construction — temporal ordering issue

#### Root Cause (verified)

In `packages/cli/src/cli-commands/skills/fork/handler.ts` (lines 253-270), the `registryRef` for the install step is built BEFORE publish runs:

```typescript
const registryRef: RegistrySkillRef = {
  // ...
  version: "0.1.0",
  integrity: "", // <-- empty: publish hasn't computed it yet
};
```

The fork pipeline is: copy -> publish -> install (sequential, concurrency: 1). The integrity hash is computed during publish (`publish.ts:134: const integrity = yield* computeIntegrity(archive)`), but the install step's `registryRef` is already built with `integrity: ""` before any step runs.

At install time, `installFromRegistry` (install.ts:203) checks `const useExisting = ref.integrity === "" && canonicalExists` — if the canonical path exists (from the copy step), it skips the integrity check and uses the existing directory. So the install succeeds, but the lockfile entry records `integrity: ""`.

#### Fix approach

Either:

- Pass the computed integrity from publish back to the install step (requires the plan execution to support step-to-step data flow)
- Re-compute integrity in the install step after publish completes
- Have the fork handler run publish first, capture the integrity, then build the install step

#### Exact code locations

| File                                                       | Line | Issue                                                        |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------------ |
| `packages/cli/src/cli-commands/skills/fork/handler.ts`     | 269  | `integrity: ""` hardcoded                                    |
| `packages/cli/src/extensions/skills/operations/install.ts` | 203  | `useExisting` bypasses integrity                             |
| `packages/cli/src/sources/source-to-lock-entry.ts`         | 131  | `integrity: ref.integrity` — writes empty string to lockfile |

---

### 6. FORK-2: Lockfile `sourceName` Always `"default"` [major]

**Component:** Lockfile R/W
**Severity:** Major
**Root cause pattern:** Missing data propagation from source resolution to lockfile entry

#### Root Cause (verified)

The `installSkill` operation handler in `packages/cli/src/extensions/skills/operations/install.ts` (line 490) hardcodes `sourceName: Option.none()`:

```typescript
const lockEntry = sourceToLockEntry({
  ref,
  agents,
  now: new Date(),
  sourceName: Option.none(), // <-- always None
});
```

And `sourceToLockEntry` at `source-to-lock-entry.ts:132`:

```typescript
sourceName: Option.getOrElse(input.sourceName, () => "default"),
```

The `InstallSkillOperationArgs` type (install.ts:49-58) has no `sourceName` field. The actual registry source name (e.g., "local", "my-registry") is known at the fork handler level (line 245: `const registryName = registrySource.name`) and even passed to the publish step, but is not passed through to the install step's operation args.

The same issue exists in `manager.ts:68` (`buildSkillLockEntry`).

#### Fix approach

Add `sourceName: Option<string>` to `InstallSkillOperationArgs`. Thread the registry source name from the fork handler through the install operation to `sourceToLockEntry`.

#### Exact code locations

| File                                                       | Line | Issue                                    |
| ---------------------------------------------------------- | ---- | ---------------------------------------- |
| `packages/cli/src/extensions/skills/operations/install.ts` | 490  | `sourceName: Option.none()` hardcoded    |
| `packages/cli/src/extensions/skills/manager.ts`            | 68   | Same hardcoded `Option.none()`           |
| `packages/cli/src/cli-commands/skills/fork/handler.ts`     | 245  | `registryName` is known but not threaded |

---

### 7. FORK-3: Fork Exits 0 When Publish Fails [major]

**Component:** Handler logic / plan resolution
**Severity:** Major
**Root cause pattern:** Missing error propagation from plan execution results

#### Root Cause (verified)

The fork handler in `packages/cli/src/cli-commands/skills/fork/handler.ts` (lines 319-327):

```typescript
yield* ws.resolvePlan(
  bridgeLegacyPlan(plan, { ... }),
);
yield* log.success("Done");   // <-- always reached
```

`resolvePlan` calls `applyPlan` (apply-plan.ts:97), which NEVER fails — it catches all `CliError` and converts them to error results inside `CompletedJobStep`. `resolvePlan` (service.ts:694-696) returns the `ExecutedPlan` without checking for error results:

```typescript
const executed = yield * applyPlan(augmentedPlan);
yield * showPlan(executed);
return executed;
```

The fork handler does not inspect the returned `ExecutedPlan` for error results. It unconditionally logs "Done" and exits 0.

This is a systemic issue: ANY handler that calls `resolvePlan` and doesn't check the result will silently succeed on step failures. Affected handlers: fork, update, and potentially others.

#### Fix approach

Option A: Make `resolvePlan` itself fail with `CliError` when any step has an error result. This is the safest fix since it protects all callers.

Option B: Have each handler inspect the `ExecutedPlan` and fail explicitly. This is less safe since new handlers could forget to check.

#### Exact code locations

| File                                                   | Line    | Issue                                               |
| ------------------------------------------------------ | ------- | --------------------------------------------------- |
| `packages/cli/src/cli-commands/skills/fork/handler.ts` | 319-327 | Doesn't inspect `ExecutedPlan` for errors           |
| `packages/cli/src/workspace/service.ts`                | 694-696 | `resolvePlan` returns success even with step errors |
| `packages/cli/src/workspace/apply-plan.ts`             | 97      | `applyPlan` never fails                             |

---

### 8. PUBLISH-1: Auth Guard Auto-Accepts Login with `--yes` in Non-TTY [minor]

**Component:** Auth / handler logic
**Severity:** Minor
**Root cause pattern:** Missing validation — `--yes` auto-accepts device code flow in non-TTY

#### Root Cause (verified)

In `packages/cli/src/auth/guard.ts` (lines 88-97):

```typescript
if (!flags.yes) {
  const prompt = yield* ClackPrompt;
  const shouldLogin = yield* prompt.confirm({ ... });
  if (!shouldLogin) {
    return yield* Effect.fail(AUTH_LOGIN_REQUIRED_DECLINED);
  }
}
// Falls through to inlineLogin() when --yes is true
yield* inlineLogin(registryUrl);
```

When `--yes` is true, the confirmation prompt is skipped and `inlineLogin()` runs unconditionally. `inlineLogin()` starts a device code flow that requires opening a browser and entering a code. In a non-TTY environment (CI, scripts), this will hang waiting for browser interaction that never comes.

The `--non-interactive` check at line 84-86 correctly fails fast. But `--yes` without `--non-interactive` in a non-TTY context bypasses the prompt but doesn't bypass the device flow.

Note: In practice, non-TTY without `--non-interactive` is caught because `nonInteractive` auto-detects via `!isInteractive()`. So this issue only manifests if `--yes` is passed in an interactive terminal without a token — the device flow will start without asking.

#### Exact code locations

| File                             | Line   | Issue                                                   |
| -------------------------------- | ------ | ------------------------------------------------------- |
| `packages/cli/src/auth/guard.ts` | 88-103 | `--yes` auto-accepts login prompt, triggers device flow |

---

## Shared Root Causes

### Shared Root Cause 1: Missing Service Layer Wiring

**Errors:** INSTALL-1, UNINSTALL-1 (and equivalents for packs, commands, mcp-servers)
**Impact:** 8 commands crash across 4 extension types
**Single fix:** Wire `*ManagerLive` and `*CommandWorkflowActionsLive` layers in `command-runtime.ts` or per-command entry points.
**Fix location:** `packages/cli/src/command-runtime.ts` or per-command files in `packages/cli/src/commands/skills/*.ts`

### Shared Root Cause 2: `sourceName` Always `Option.none()` in Lock Entry Construction

**Errors:** FORK-2, and any registry install via the legacy `installSkill` handler or `SkillManager`
**Impact:** All registry-sourced lockfile entries record `sourceName: "default"` regardless of actual source
**Single fix:** Thread `sourceName` through `InstallSkillOperationArgs` and `SkillManager` methods.

---

## Dependency Graph

```
INSTALL-1/UNINSTALL-1 (blocker)
    |
    +--> All E2E tests for install/uninstall (13 failures)
    +--> FORK testing depends on install working
    +--> UPDATE testing depends on install working
    |
    v
FORK-3 (major) — independent fix but testing requires INSTALL-1 fix
    |
    v
FORK-1 (major) — independent fix, testing requires INSTALL-1 + FORK-3
FORK-2 (major) — independent fix, testing requires INSTALL-1
    |
    v
UPDATE-1 (major) — independent fix, testing requires INSTALL-1
UPDATE-2 (minor) — independent fix, testing requires INSTALL-1
    |
    v
AUTOINIT-1 (major) — independent fix, can be tested standalone
PUBLISH-1 (minor) — independent fix, can be tested standalone
```

### Fix Order

1. **INSTALL-1 / UNINSTALL-1** — Unlocks all other testing. Must be fixed first.
2. **FORK-3** — Fixes silent failure pattern; may affect how other errors manifest.
3. **FORK-1, FORK-2, UPDATE-1** — Independent lockfile data issues. Can be fixed in parallel.
4. **AUTOINIT-1** — Independent UX issue. Can be fixed anytime.
5. **UPDATE-2, PUBLISH-1** — Low-priority, independent fixes.

---

## Cross-Cutting Observations

### 1. All Extension Types Share the Same Blocker

The missing service wiring is not specific to skills. All 8 install/uninstall commands across skills, packs, commands, and mcp-servers have identical patterns:

- Handler yields `*CommandWorkflowActions` service
- Service requires `*ManagerLive` layer
- Neither is wired in production runtime

### 2. `resolvePlan` Silently Swallows Step Failures

`applyPlan` converts all errors to result objects and never fails. `resolvePlan` returns the `ExecutedPlan` without inspecting it. Any handler that calls `resolvePlan` without checking the result will exit 0 on step failures. This is a systemic design issue beyond just the fork command.

### 3. `sourceToLockEntry` Lacks Update Semantics

The function always creates fresh timestamps and uses `Option.none()` for `sourceName`. It was designed for initial installs and has no support for preserving existing lock entry state during updates. Both UPDATE-1 and FORK-2 stem from this limitation.

### 4. Fork Pipeline Has a Temporal Coupling Problem

The fork handler pre-builds the install step's `registryRef` before the publish step runs. Since publish computes the integrity hash, the install step can never have the correct integrity at plan construction time. The current plan model (static steps built upfront, executed sequentially) doesn't support step-to-step data flow.
