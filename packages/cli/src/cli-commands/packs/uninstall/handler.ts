/**
 * Uninstall command handler - Effect-based orchestration for `axm packs uninstall`.
 *
 * Uses plan-based reconciliation pattern:
 * 1. Load lockfile
 * 2. Expand glob pattern against lockfile keys
 * 3. Build UninstallPackOperations
 * 4. Build plan (diff against lockfile)
 * 5. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { UninstallPackOperation } from "../operations.js";
import { buildUninstallPlan } from "./build-plan.js";
import { expandGlob } from "../../../skills/index.js";
import { uninstallPack } from "./uninstall-pack.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs uninstall handler.
 */
export interface UninstallPackHandlerArgs {
  /** Name or glob pattern of the pack to uninstall */
  readonly name: string;
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallPack = Effect.fn("UninstallPack.handle")(function* (
  args: UninstallPackHandlerArgs,
) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm packs uninstall");

  // Step 1: Load lockfile
  const lockedPacks = yield* ws.getLockedPacks();
  const lockedSkills = yield* ws.getLockedSkills();
  const lockfile = { lockfileVersion: 1, skills: lockedSkills, packs: lockedPacks };

  // Step 2: Expand glob pattern
  const packNames = expandGlob(args.name, Object.keys(lockedPacks));

  // Handle glob matching zero packs
  if (args.name.includes("*") && packNames.length === 0) {
    yield* log.warn(`No packs matched pattern "${args.name}"`);
    yield* log.success("Nothing to uninstall.");
    return;
  }

  // For literal names not in lockfile, still build an operation (plan marks as no-op)
  const names = packNames.length > 0 ? packNames : [args.name];

  // Step 3: Build operations
  const ops = names.map(
    (name) =>
      ({
        name: "uninstall-pack",
        args: { packName: name },
      }) satisfies UninstallPackOperation,
  );

  // Step 4: Build plan
  const plan = buildUninstallPlan(ops, lockfile, "Uninstall pack(s)", Option.none());

  // Step 5: Resolve plan via workspace
  yield* ws.resolvePlan(plan, { "uninstall-pack": uninstallPack });

  yield* log.success("Done");
});
