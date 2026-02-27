/**
 * Packs new handler — validates input, resolves namespace,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { formatFqn } from "../../../extensions/index.js";
import { TelemetryClient } from "../../../telemetry/index.js";
import { PACK_MANIFEST_FILENAME } from "../../../extensions/packs/manifest-schema.js";
import type { NewPackOperation } from "../../../extensions/packs/operations/new-pack.js";
import { newPack } from "../../../extensions/packs/operations/new-pack.js";
import { computePackPaths } from "../../../extensions/packs/paths.js";
import { Log } from "../../../clack-effect/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildSingleStepPlan } from "../../skills/plan-helpers.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksNewHandlerArgs {
  /** Name of the pack (without namespace). */
  readonly name: string;
  /** Optional namespace override. */
  readonly namespace: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksNew = Effect.fn("PacksNew.handle")(function* (args: PacksNewHandlerArgs) {
  const tc = yield* TelemetryClient;
  yield* tc.trackEvent("command_invoked", { command: "packs new" });
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* Log;

  yield* log.info("axm packs new");

  // Resolve namespace
  const normalizeNamespace = (s: string) => (s.startsWith("@") ? s : `@${s}`);
  const namespace = Option.isSome(args.namespace)
    ? normalizeNamespace(args.namespace.value)
    : yield* ws.getConfiguredNamespace().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeCliError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No namespace configured for pack creation",
                  howToFix:
                    "Configure a namespace in settings.json with `axm init`, or use --namespace",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  const fqn = formatFqn({ namespace, type: "packs", name: args.name });
  const base = ws.baseDir;

  // Check if pack already exists
  const packDir = computePackPaths(path.join, base, namespace, args.name);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

  const exists = yield* fs.exists(manifestPath).pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "PACK_CHECK_FAILED",
        what: `Failed to check if pack exists: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  if (exists) {
    return yield* makeCliError({
      code: "PACK_ALREADY_EXISTS",
      what: `Pack '${fqn}' already exists at ${packDir.canonicalPath}`,
      howToFix: "Choose a different name or remove the existing pack first",
    });
  }

  // Build operation
  const op = {
    name: "new-pack",
    args: { name: args.name, namespace },
  } satisfies NewPackOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "New pack",
    description: `Create ${fqn}`,
    label: fqn,
  });

  yield* ws.resolvePlan(bridgeLegacyPlan(plan, { "new-pack": newPack }));

  yield* log.success(`Created pack ${fqn}`);
});
