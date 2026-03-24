/**
 * Packs new handler — validates input, resolves profile,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../../app-error/index.js";
import { formatFqn, PACK_MANIFEST_FILENAME } from "../../../extensions/index.js";
import type { NewPackOperation } from "../../../extensions/packs/operations/new-pack.js";
import { newPack } from "../../../extensions/packs/operations/new-pack.js";
import { computePackPaths } from "../../../extensions/packs/paths.js";
import { Output } from "../../../output/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildSingleStepPlan } from "../../skills/plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksNewHandlerArgs {
  /** Name of the pack (without profile). */
  readonly name: string;
  /** Optional profile override. */
  readonly profile: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksNew = Effect.fn("PacksNew.handle")(function* (args: PacksNewHandlerArgs) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = yield* Output;

  yield* output.info("axm packs new");

  // Resolve profile
  const normalizeProfile = (s: string) => (s.startsWith("@") ? s : `@${s}`);
  const profile = Option.isSome(args.profile)
    ? normalizeProfile(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for pack creation",
                  howToFix:
                    "Configure a profile in settings.json with `axm init`, or use --profile",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  const fqn = formatFqn({ handle: profile, type: "packs", name: args.name });
  const base = ws.baseDir;

  // Check if pack already exists
  const packDir = computePackPaths(path.join, base, profile, args.name);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

  const exists = yield* fs.exists(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_CHECK_FAILED",
        what: `Failed to check if pack exists: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  if (exists) {
    return yield* makeAppError({
      code: "PACK_ALREADY_EXISTS",
      what: `Pack '${fqn}' already exists at ${packDir.canonicalPath}`,
      howToFix: "Choose a different name or remove the existing pack first",
    });
  }

  // Build operation
  const op = {
    name: "new-pack",
    args: { name: args.name, profile },
  } satisfies NewPackOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "New pack",
    description: `Create ${fqn}`,
    label: fqn,
  });

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "new-pack": newPack }));

  yield* output.success(`Created pack ${fqn}`);
});
