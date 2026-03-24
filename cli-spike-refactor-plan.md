# CLI Spike Refactor Plan

Trim `packages/cli-spike` from 10 skill subcommands to 4, keeping one example of every CLI infrastructure pattern.

## Current State

`packages/cli-spike/src/commands/skills/` has 10 subcommands:

- **Fully implemented:** `list`, `install` (with output schemas, text renderers, service usage)
- **Stubs (Console.log):** `uninstall`, `enable`, `disable`, `new`, `fork`, `publish`, `update`, `rename`

## Capabilities to Demonstrate

| #   | Capability                                         | Proven by           |
| --- | -------------------------------------------------- | ------------------- |
| 1   | Command group with subcommands                     | `skills` parent     |
| 2   | Output service — format-agnostic results           | `list`              |
| 3   | Output schema with `_version` + text renderer      | `list`              |
| 4   | Activity service — spinners + NDJSON streaming     | `install`           |
| 5   | `isLongRunning` pipe-default behavior              | `install`           |
| 6   | Required positional arg                            | `install` (source)  |
| 7   | Choice flag with default                           | `list` (--scope)    |
| 8   | Repeated flag (`atLeast(0)`)                       | `install` (--skill) |
| 9   | Boolean flag                                       | `install` (--all)   |
| 10  | Per-command flags: `--yes`                         | `install`           |
| 11  | Per-command flags: `--preview`                     | `uninstall`         |
| 12  | Per-command flags: `--force`                       | `uninstall`         |
| 13  | All three per-command flags combined               | `uninstall`         |
| 14  | Optional string flag                               | `new` (--namespace) |
| 15  | Optional repeated flag (`atLeast(1)`)              | `new` (--agent)     |
| 16  | Command alias                                      | `list` (ls)         |
| 17  | Stub-to-real conversion pattern (tutorial comment) | `uninstall`         |

## Commands: Keep (4)

| Command     | Status         | Role                                                                                                                               |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `list`      | Implemented    | **Instant command reference.** Output.result(), output schema, text renderer, choice flag, repeated flag, command alias            |
| `install`   | Implemented    | **Long-running command reference.** Activity.withSpinner(), status updates, isLongRunning, positional arg, boolean flag, --yes     |
| `uninstall` | Stub → enhance | **All three per-command flags.** Add `--force` to existing `--yes` + `--preview`. Relocate stub conversion tutorial from enable.ts |
| `new`       | Stub           | **Optional flags.** Optional string (--namespace), optional repeated (--agent atLeast(1)). Creation pattern                        |

## Commands: Remove (6)

| Command   | Why remove                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------- |
| `enable`  | Same arg/flag shape as `disable`. Stub conversion tutorial moves to `uninstall`                 |
| `disable` | Identical to `enable`                                                                           |
| `fork`    | `--force` + `--yes` already covered by enhanced `uninstall`                                     |
| `publish` | Repeated positional arg (`atLeast(1)`) — minor pattern not worth a command                      |
| `update`  | All three flags already covered by enhanced `uninstall`; optional positional is a minor pattern |
| `rename`  | Two positional args — minor pattern not worth a command                                         |

## Execution Steps

### Step 1 — Enhance `uninstall.ts`

**File:** `packages/cli-spike/src/commands/skills/uninstall.ts`

Add `forceFlag` import and flag so it demonstrates all three per-command flags together. Relocate the stub conversion tutorial comment block from `enable.ts`.

### Step 2 — Update `command.ts` (skills group)

**File:** `packages/cli-spike/src/commands/skills/command.ts`

Remove imports and subcommand registrations for: `enable`, `disable`, `fork`, `publish`, `update`, `rename`.

### Step 3 — Delete removed command files

```
rm packages/cli-spike/src/commands/skills/enable.ts
rm packages/cli-spike/src/commands/skills/disable.ts
rm packages/cli-spike/src/commands/skills/fork.ts
rm packages/cli-spike/src/commands/skills/publish.ts
rm packages/cli-spike/src/commands/skills/update.ts
rm packages/cli-spike/src/commands/skills/rename.ts
```

### Step 4 — Verify

1. `pnpm build` — no broken imports
2. `pnpm typecheck` — no type errors
3. Manual: `axm-spike skills --help` shows only: install, uninstall, list, new
