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
import type { PlannedJobStep, OperationResult, Operation } from "../../../workspace/plan.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import { parseScopedName } from "../../skills/naming.js";

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

/**
 * Args for the unpack-pack operation.
 */
export type UnpackPackOperationArgs = {
  /** Pack FQN to unpack. */
  readonly name: string;
};

/**
 * Unpack a pack into direct settings entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UnpackPackOperation = Operation<"unpack-pack", UnpackPackOperationArgs>;

// -----------------------------------------------------------------------------
// Operation Handler
// -----------------------------------------------------------------------------

/**
 * Unpack operation handler.
 *
 * 1. Look up pack in lockfile for resolved extensions
 * 2. Read current settings to find existing direct skill entries
 * 3. Add resolved skills as direct entries (skip existing)
 * 4. Remove pack from settings and lockfile
 */
export const unpackPack: OperationHandler<UnpackPackOperation, Workspace> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // Look up the pack in the lockfile
    const lockedPack = yield* ws.getLockedPack(op.args.name);

    if (Option.isNone(lockedPack)) {
      return yield* makeCliError({
        code: "PACK_NOT_INSTALLED",
        what: `Pack "${op.args.name}" is not installed`,
        howToFix: "Install the pack first with `axm packs install`.",
      });
    }

    const entry = lockedPack.value;

    if (entry.type !== "registry") {
      return yield* makeCliError({
        code: "PACK_UNPACK_UNSUPPORTED",
        what: `Cannot unpack "${op.args.name}" — only registry packs can be unpacked`,
      });
    }

    // Read current configured skills to preserve existing direct entries
    const currentSkills = yield* ws.getConfiguredSkills();

    // Add resolved skills as direct entries (only if not already present)
    // Use the short name (after scope/) as the settings key since SkillsMapSchema
    // validates keys against agentskills.io naming (no @ or / allowed).
    yield* Effect.forEach(
      Object.entries(entry.resolvedSkills),
      ([fqn, version]) =>
        Effect.gen(function* () {
          const { name: shortName } = parseScopedName(fqn);
          if (shortName in currentSkills) return; // preserve existing direct entry
          yield* ws.setSkill({
            name: shortName,
            lockEntry: {
              type: "registry" as const,
              scope: entry.scope,
              name: shortName,
              resolvedVersion: version,
              checksum: "",
              sourceName: entry.sourceName,
              agents: [],
              installedAt: new Date(),
              updatedAt: new Date(),
            },
            versionConstraint: Option.none(),
          });
        }),
      { concurrency: 1 },
    );

    // Remove the pack entry from settings and lockfile
    yield* ws.removePack(op.args.name);

    const skillCount = Object.keys(entry.resolvedSkills).length;
    return {
      result: "success",
      message: `Unpacked ${op.args.name}: ${skillCount} skill(s) promoted to direct entries`,
    } satisfies OperationResult;
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs unpack` command.
 */
export const handleUnpack = (args: UnpackHandlerArgs) =>
  Effect.gen(function* () {
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
      "unpack-pack": unpackPack as OperationHandler<UnpackPackOperation, never>,
    });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("UnpackPack.handle"));
