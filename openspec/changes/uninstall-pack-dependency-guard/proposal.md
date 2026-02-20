## Why

When a user tries to uninstall a skill that is a dependency of an installed pack, the plan currently succeeds and the operation silently removes the skill from settings while keeping it on disk. This is confusing — the user thinks they uninstalled it, but it's still present. The plan builder should catch this upfront and fail with a clear error explaining the pack dependency and suggesting `axm skills disable` as an alternative.

## What Changes

- **BREAKING**: `buildSkillUninstallPlan` fails when any requested skill is referenced by an installed pack's `resolvedSkills`
- Error message identifies which pack(s) depend on each blocked skill
- Error guides user to `axm skills disable <skill>` instead
- Plan builder becomes effectful (needs lockfile pack data to validate)

## Capabilities

### New Capabilities

_None — this is a validation guard on an existing capability._

### Modified Capabilities

- `skills-uninstall-build-plan`: Add pack-dependency validation that fails the plan when any target skill is referenced by an installed pack

## Impact

- `packages/cli/src/cli-commands/skills/uninstall/plan.ts` — add pack-dependency check, becomes effectful
- `packages/cli/src/cli-commands/skills/uninstall/handler.ts` — pass locked packs to plan builder
- `packages/cli/src/extensions/skills/operations/uninstall.ts` — pack-ownership check at operation level may become redundant (plan now guards this)
- Existing `skills-uninstall-build-plan` spec gains new requirement
- Existing tests for plan builder and handler need updating
