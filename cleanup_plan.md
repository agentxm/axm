# CLI Cleanup Plan

Eliminate duplicative, dead, and re-exported code from `packages/cli/src/`. Move reusable business logic to core. Remove all backward-compatibility re-exports.

## 1. Delete dead code

- [ ] Delete `packages/cli/src/output.ts` (pure re-export barrel, zero consumers)
- [ ] Delete `packages/cli/src/telemetry/client.ts` (unused `TelemetryClientLive`, superseded by core's `CliTelemetryConfigService`)
- [ ] Delete `packages/cli/src/telemetry/client.test.ts` (tests dead code)

## 2. Inline telemetry/mode.ts and delete telemetry/

- [ ] Inline `resolveTelemetryMode` call in `runtime.ts` — already has env values unpacked at lines 86-91, just call core's `resolveTelemetryMode` directly
- [ ] Inline `resolveTelemetryMode` call in `root/init/handler.ts` — same pattern
- [ ] Delete `packages/cli/src/telemetry/mode.ts`
- [ ] Delete `packages/cli/src/telemetry/mode.test.ts`
- [ ] Delete `packages/cli/src/telemetry/index.ts`
- [ ] Remove `packages/cli/src/telemetry/` directory

## 3. Move resolve-plan + display-plan to core

- [ ] Move `packages/cli/src/workspace/resolve-plan.ts` to `packages/core/src/unstable/workspace/resolve-plan.ts`
  - Update internal imports to use relative paths within core
  - The `setReconciliationAdapters` call at module load should remain co-located
- [ ] Move `packages/cli/src/workspace/display-plan.ts` to `packages/core/src/unstable/workspace/display-plan.ts`
  - Update internal imports to use relative paths within core
- [ ] Move `packages/cli/src/workspace/display-plan.test.ts` to core alongside the implementation
- [ ] Move `packages/cli/src/workspace/resolve-plan-architecture.test.ts` to core alongside the implementation
- [ ] Export `resolvePlan` and `displayPlan` from `packages/core/src/unstable/workspace/index.ts`
- [ ] Update all 16 CLI import sites for `resolvePlan` to import from `@axm.sh/core/unstable/workspace`
- [ ] Update any CLI test imports for `displayPlan` to import from `@axm.sh/core/unstable/workspace`

## 4. Move workflows to core

Depends on step 3 (workflows import `resolvePlan`).

- [ ] Move `packages/cli/src/workflows/install-command/workflow.ts` to `packages/core/src/unstable/workflows/install-command/workflow.ts`
  - Update `resolvePlan` import to relative path within core
- [ ] Move `packages/cli/src/workflows/install-command/workflow.test.ts` alongside
- [ ] Move `packages/cli/src/workflows/uninstall-command/workflow.ts` to `packages/core/src/unstable/workflows/uninstall-command/workflow.ts`
  - Update `resolvePlan` import to relative path within core
- [ ] Move `packages/cli/src/workflows/uninstall-command/workflow.test.ts` alongside
- [ ] Create barrel exports in core (`packages/core/src/unstable/workflows/index.ts`)
- [ ] Update all 16 CLI handler/command-actions imports to use `@axm.sh/core/unstable/workflows`
- [ ] Delete `packages/cli/src/workflows/` directory

## 5. Inline workspace/service.ts into runtime.ts

Depends on step 3 (after resolve-plan moves, service.ts is the last logic file in workspace/).

- [ ] In `runtime.ts`: replace `import { layer as workspaceLayer } from "./workspace/service.js"` with direct call to core's `layer()` passing `resolveBuiltinPack`
  - Import `layer as coreWorkspaceLayer` from `@axm.sh/core/unstable/workspace`
  - Import `resolveBuiltinPack` from `./builtin-pack/index.js`
  - Inline: `coreWorkspaceLayer({ ...options, resolveBuiltinPack: resolveBuiltinPack() })`
- [ ] Update `test-helpers.ts`: replace `import { layer as workspaceLayer } from "./workspace/service.js"` with same pattern
- [ ] Update all test files importing `workspaceLayer` from `../workspace/service.js` (5 files) to import from `@axm.sh/core/unstable/workspace` with the same inline pattern
- [ ] Delete `packages/cli/src/workspace/service.ts` (remove all re-exports — consumers import from core directly)

## 6. Deduplicate builtin-pack constants

- [ ] Delete `BUILTIN_PACK_FQN`, `BUILTIN_PACK_SCOPE`, `BUILTIN_PACK_NAME`, and `ResolvedBuiltinPack` type from `packages/cli/src/builtin-pack/index.ts` — all already defined in `packages/core/src/unstable/workspace/builtin-packs.ts`
- [ ] Update `builtin-pack/index.ts` to import constants/type from `@axm.sh/core/unstable/workspace`
- [ ] Update any CLI imports of these constants to use core
- [ ] Update `builtin-pack/builtin-pack.test.ts` to import constants from core

## 7. Clean up workspace/ directory

Depends on steps 3 and 5.

- [ ] Move `packages/cli/src/workspace/test-stubs.ts` to `packages/cli/src/test-stubs.ts` (or co-locate with `test-helpers.ts`)
- [ ] Update all test imports referencing `workspace/test-stubs.js`
- [ ] Delete `packages/cli/src/workspace/` directory

## 8. Verify

- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] No remaining imports from deleted paths (grep for `workspace/service.js`, `workspace/resolve-plan.js`, `workspace/display-plan.js`, `./telemetry/`, `./output.js`, `./workflows/`)
