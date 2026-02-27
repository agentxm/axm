## Context

The CLI has three prompt-control flags (`--yes`, `--non-interactive`, `--force`) with recently clarified semantics in CLAUDE.md. The current implementation predates these guidelines. An audit found:

- `--force` is used for warning auto-acceptance (should be constraint override)
- `--yes` supplies selection defaults in 2 commands (should only skip confirmations)
- `--non-interactive` does not imply `--yes` and TTY auto-detection is unwired
- `--force` is silently dropped in 2 commands (`skills install`, `packs install`)

The core of the issue is in `workspace/service.ts` `resolvePlan()`, which owns the plan confirmation flow.

## Goals / Non-Goals

**Goals:**

- Align all commands with the flag semantics defined in CLAUDE.md
- Fix broken `--force` propagation in `skills install` and `packs install`
- Make `--non-interactive` imply `--yes`
- Wire TTY auto-detection for `--non-interactive`
- Ensure consistent, actionable error messages across all flag interactions

**Non-Goals:**

- Adding `--force` to commands that don't have constraint scenarios (e.g., `skills list`, `skills rename`)
- Redesigning the plan/readiness system
- Adding new readiness states

## Decisions

### 1. Redefine readiness tiers in `resolvePlan()`

**Current:** errors always block, warnings prompt (or `--force` auto-accepts).

**New:** Three-tier model aligned with the severity model in CLAUDE.md:

| Readiness | Without `--force`                         | With `--force`                       |
| --------- | ----------------------------------------- | ------------------------------------ |
| `error`   | Fail with `CliError` suggesting `--force` | Downgrade to warning (show, proceed) |
| `warn`    | Show warning, proceed (never blocks)      | Show warning, proceed                |
| `ok`      | Proceed                                   | Proceed                              |

**Rationale:** `--force` overrides constraints that cause failure. Warnings never block. This eliminates the current conflation where `--force` acts as `--yes` for warnings.

**Alternative considered:** Keep warnings as blocking prompts skippable by `--yes`. Rejected because warnings-that-block are really errors by definition — if it blocks, call it an error and let `--force` override it.

### 2. Resolve `--non-interactive` early with TTY fallback

In the workspace service constructor, resolve `nonInteractive` once:

```
resolvedNonInteractive = explicit flag || CI=true || !process.stdin.isTTY
resolvedYes = explicit --yes || resolvedNonInteractive
```

This uses the existing `isInteractive()` from `utils/tty.ts` and ensures `--non-interactive` implies `--yes`.

**Rationale:** Single resolution point prevents inconsistency. The `isInteractive()` utility already exists but is unused.

### 3. Move selection-default behavior from `--yes` to `--non-interactive`

In `skills install` (`select-skills.ts`) and `init` (`initialization.ts`), the "auto-select all" behavior currently triggered by `--yes` should be triggered by `--non-interactive` instead (which now implies `--yes`, so the confirmation skip still works).

- `--yes` alone: skip confirmation prompt, but still show selection prompt
- `--non-interactive`: auto-select all (default), skip confirmation

**Rationale:** `--yes` means "I know what I'm doing, skip the pause." It should not change _what_ gets selected.

### 4. Fix `--force` propagation in intent chains

`skills install` and `packs install` accept `--force` in their command definitions but lose it during intent building. The fix is mechanical: add `force` to the intent types and pass it through to plan resolution.

### 5. Update `--force` descriptions in all command definitions

All 5 commands with `--force` have misleading descriptions. Update to consistently say: "Override constraints that would cause failure."

## Risks / Trade-offs

**Breaking change in `--force` semantics** — Users relying on `--force` to auto-accept warnings will need to use `--yes` instead (warnings no longer block, so this is moot in most cases). The real behavior change is that `--force` now overrides errors. → Acceptable: the old behavior was broken/inconsistent anyway.

**`--non-interactive` implying `--yes` changes CI behavior** — CI environments with `CI=true` will now auto-accept confirmations where they previously failed. → This is the correct behavior for CI. The previous behavior (fail unless both flags passed) was a gap.

**`--yes` no longer auto-selects in `skills install` and `init`** — Users who relied on `axm skills install <source> --yes` to install all skills will need `--non-interactive` or `--all`. → `--all` is the explicit flag for this and already exists for `skills install`. For `init`, `--non-interactive` is the natural choice.

## Open Questions

- Should `--force` error messages include a `howToFix` suggesting `--force`? (Proposed: yes, always.)
- Should commands without `--force` today (e.g., `skills new`, `packs new`) gain it for "already exists" constraints? (Proposed: defer — add when a real constraint scenario arises.)
