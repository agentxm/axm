## Context

When `packs uninstall <name>` is called for a pack not in the lockfile, the operation handler returns `no-op` immediately at line 76-77 of `extensions/packs/operations/uninstall.ts`. It never checks whether the managed extension folder (`.axm/extensions/@namespace/packs/<name>/`) still exists on disk.

The skills uninstall handler already handles this correctly — it calls `existsInAnyLocation()` to check disk state independently of the lockfile, and proceeds with cleanup when the folder exists (line 147-151 of `extensions/skills/operations/uninstall.ts`).

## Goals / Non-Goals

**Goals:**

- When a pack is not in the lockfile, scan the managed extensions directory for a matching pack folder and remove it if found
- Return a meaningful result distinguishing "removed from disk" from "nothing to do"
- Follow the same pattern as skills uninstall for consistency

**Non-Goals:**

- Orphan detection for unlocked packs (no lockfile entry = no `resolvedSkills` to check)
- Handling packs spread across multiple namespaces (one scan is sufficient)
- Adding a dedicated "cleanup" or "prune" command

## Decisions

### Scan namespace directories to find orphaned pack folders

**Decision**: When the pack is not in the lockfile, scan `.axm/extensions/@*/packs/<name>` to find the folder on disk — same approach as `existsInAnyLocation` in skills uninstall.

**Rationale**: Without a lockfile entry, we don't know the namespace. Scanning `@*` directories is cheap (typically 1-3 entries) and matches the existing skills pattern.

**Alternative considered**: Require the user to pass a fully-qualified name. Rejected — the simple name should work, and we already have the scanning pattern.

### Return `success` when folder was removed from disk

**Decision**: If the folder existed and was removed, return `result: "success"` with a message like `"Removed pack directory from disk"`. If no folder exists either, return the existing `no-op`.

**Rationale**: The operation actually did something — the user should see it. This also means the plan display will show it as an action rather than a skip.

### Keep the plan builder unchanged

**Decision**: The plan builder (`plan.ts`) stays as-is — it still marks unlocked packs as `expectedResult: "no-op"`. The operation handler may return `success` instead, which the plan resolver already handles (it just logs the actual result).

**Rationale**: The plan builder is a pure function that only knows about lockfile state. Disk scanning belongs in the effectful operation handler.

## Risks / Trade-offs

**[Risk]** Pack folder exists under a different sanitized name than expected → **Mitigation**: Use `sanitizeName()` consistently (already used in skill paths). Pack names are simpler than skill names so this is low risk.

**[Trade-off]** Scanning all `@*` directories adds a small I/O cost to no-op cases → Acceptable: typically 1-3 namespace dirs, and `readDirectory` + `exists` are cheap.
