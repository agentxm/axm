/**
 * Unpack command handler -- Effect-based orchestration for `axm packs unpack`.
 *
 * Flattens a pack's resolved extensions into settings.json as direct entries,
 * preserves existing direct entries, and removes the pack entry from settings
 * and lockfile.
 *
 * This is a settings-level operation -- it does not re-download anything.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import {
  unpackPack,
  type UnpackPackOperation,
} from "../../../extensions/packs/operations/unpack.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs unpack command.
 */
export interface UnpackHandlerArgs {
  /** Pack name (FQN like @scope/name). */
  readonly name: string;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs unpack` command.
 */
export const handleUnpack = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const ws = yield* Workspace;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;

  yield* log.info("axm packs unpack");

  // Validate pack exists in lockfile
  const handle = yield* spinnerSvc.start("Checking pack...");
  const lockedPack = yield* ws.getLockedPack(args.name);

  if (Option.isNone(lockedPack)) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
        code: "PACK_NOT_INSTALLED",
        what: `Pack "${args.name}" is not installed`,
        howToFix: "Install the pack first with `axm packs install`.",
      }),
    );
  }

  yield* handle.stop(`Found ${args.name}`);

  // Build plan
  const steps: PlannedJobStep<UnpackPackOperation>[] = [
    {
      _tag: "PlannedJobStep",
      operation: {
        name: "unpack-pack",
        args: { name: args.name },
      } satisfies UnpackPackOperation,
      expectedResult: { result: "success", message: `Unpacked ${args.name}` },
      label: `Unpack ${args.name}`,
    },
  ];

  const plan = {
    name: "Unpack pack",
    description: Option.some(`Unpack ${args.name} into direct settings entries`),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  yield* ws.resolvePlan(plan, {
    "unpack-pack": unpackPack,
  });

  yield* log.success("Done");
});
