## Why

The pack uninstall operation currently contains its own orphaned skill removal logic — scanning disk, removing files, and updating settings/lockfile for skills. This duplicates what the skill uninstall operation already handles (including ownership-aware removal). The pack uninstall should focus on pack removal and delegate skill cleanup to the existing skill uninstall operation, which already knows how to handle pack ownership checks, partial uninstalls, and agent symlink cleanup.

## What Changes

- **BREAKING** The pack uninstall plan builder SHALL include `uninstall-skill` steps for pack dependency skills (not just `uninstall-pack` steps), making skill removal visible in the plan
- The pack uninstall operation SHALL no longer contain orphan detection or skill removal logic — it only removes the pack itself
- The plan builder SHALL determine which skills to uninstall: skills from the pack's `resolvedSkills` that are not referenced by another installed pack and not directly installed in project settings
- The skill uninstall operation handles all skill cleanup (disk, settings, lockfile, ownership checks)
- Orphan detection module (`orphan-detection.ts`) and its pure functions are removed — the plan builder computes removable skills directly

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `cli-packs-uninstall`: Plan now includes `uninstall-skill` steps for pack dependency skills; orphan detection moves from operation to plan builder; operation no longer removes skills directly
- `skills-uninstall-execute`: Must handle being invoked as part of a pack uninstall plan (no behavioral change needed — existing ownership-aware logic already handles this correctly)

## Impact

- `packages/cli/src/extensions/packs/operations/uninstall.ts` — Remove orphan detection and skill removal logic
- `packages/cli/src/extensions/packs/operations/orphan-detection.ts` — Remove file (logic moves to plan builder)
- `packages/cli/src/cli-commands/packs/uninstall/plan.ts` — Compute removable skills and emit `uninstall-skill` steps
- `packages/cli/src/cli-commands/packs/uninstall/handler.ts` — Wire skill uninstall operation handler alongside pack uninstall handler
- Tests for plan builder, pack uninstall operation, and orphan detection need updating
- `openspec/specs/cli-packs-uninstall/spec.md` — Update scenarios to reflect skill steps in plan
