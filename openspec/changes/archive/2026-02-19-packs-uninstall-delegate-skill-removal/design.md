## Context

Pack uninstall currently handles skill cleanup inline: it detects orphaned skills, removes them from disk, and cleans up settings/lockfile — all inside the `uninstallPack` operation handler. This duplicates logic the skill uninstall operation already provides (ownership-aware removal, agent symlink cleanup, canonical location handling).

The pack install command already uses a union plan pattern (`PackInstallOp = InstallPackOperation | InstallSkillOperation`) where skill installs appear as explicit plan steps alongside the pack install. Pack uninstall should follow the same pattern.

## Goals / Non-Goals

**Goals:**

- Pack uninstall plan includes explicit `uninstall-skill` steps for removable skills, making them visible to the user before execution
- Pack uninstall operation only removes the pack itself (disk, settings, lockfile)
- Skill removal is fully delegated to the existing `uninstallSkill` operation handler
- Remove the `orphan-detection.ts` module — the plan builder computes removable skills directly

**Non-Goals:**

- Changing skill uninstall behavior (it already handles pack ownership correctly)
- Changing the plan/confirm/apply flow
- Handling commands or MCP servers in this change (they can follow the same pattern later)

## Decisions

### 1. Union plan type for pack uninstall (mirrors pack install)

Follow the established pattern from `packs/install/plan.ts`:

```typescript
type PackUninstallOp = UninstallPackOperation | UninstallSkillOperation;
```

The plan builder returns `Plan<PackUninstallOp>` with pack steps first, then skill steps. The handler wires both operation handlers:

```typescript
ws.resolvePlan(plan, {
  "uninstall-pack": uninstallPack,
  "uninstall-skill": uninstallSkill,
});
```

**Why over keeping separate plans:** This is the existing convention. A single plan shows the user exactly what will happen — both pack and skill removals — in one confirmation prompt.

### 2. Removable skill computation moves to the plan builder

The plan builder receives the lockfile and configured skills as inputs and computes which skills to include as `uninstall-skill` steps. The logic is the same as the current `findOrphanedSkills` but done at plan-build time rather than operation-execute time:

1. Collect skills from the target pack's `resolvedSkills`
2. Collect skills from all remaining packs' `resolvedSkills` (excluding packs being removed in this batch)
3. Filter out skills that are directly installed in project settings
4. Remaining skills become `uninstall-skill` steps with `expectedResult: "success"`

This is a pure function — it only reads lockfile and settings data.

**Why move to plan builder:** The plan should show what will happen before execution. Orphan detection at operation-execute time means the user never sees skill removals in the plan preview.

### 3. Skill steps use empty agents array (full uninstall)

`UninstallSkillOperationArgs` requires an `agents` field. For pack-dependency skill removal, use an empty array (`agents: []`) which the skill uninstall handler interprets as "all agents" (full uninstall).

The skill uninstall handler's existing pack-ownership check (`isReferencedByPack`) handles the edge case where another pack still references the skill — it will do a settings-only removal and keep the lockfile + disk entry intact.

### 4. Plan ordering: pack steps first, skill steps second

Within the single sequential job (`concurrency: 1`):

1. `uninstall-pack` steps execute first — removes pack from disk/settings/lockfile
2. `uninstall-skill` steps execute after — skill handler's pack-ownership check now sees the pack is gone

This ordering is important: the skill uninstall handler checks `resolvedSkills` of locked packs. The pack must be removed from the lockfile first so the skill handler doesn't see it as still owning the skill.

### 5. Remove orphan-detection module and re-exports

`orphan-detection.ts` and its re-exports in `plan.ts` are removed. The plan builder computes removable skills inline. The `findOrphanedCommands` and `findOrphanedMcpServers` functions are also removed (unused after this change — commands/MCP servers can follow the same delegation pattern later).

### 6. Uninstall pack operation simplification

The `uninstallPack` handler is reduced to:

- **In lockfile:** Remove pack directory from disk, remove pack from settings/lockfile
- **Not in lockfile:** Scan for orphaned pack folders on disk (existing behavior, unchanged)

All orphan detection, skill disk removal, and skill settings/lockfile cleanup is removed from this handler.

## Risks / Trade-offs

**Ordering dependency between plan steps** — Pack must be removed from lockfile before skill uninstall runs, so the skill handler's ownership check works correctly. Mitigated by: sequential job (`concurrency: 1`) with pack steps before skill steps. This is already the pattern used in all existing plans.

**Glob patterns removing multiple packs** — When multiple packs are removed together, the plan builder must consider all packs being removed as a batch to correctly determine which skills become orphaned (a skill shared between two packs being removed is still removable). Mitigated by: the plan builder already receives all pack operations and can compute remaining packs as `lockedPacks - packsBeingRemoved`.
