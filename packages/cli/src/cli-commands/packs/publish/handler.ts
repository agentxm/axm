/**
 * Publish command handler -- Effect-based orchestration for `axm packs publish`.
 *
 * Publishes a pack from `.axm/extensions/` to a target registry:
 * 1. Registry guard (ensure registry configured)
 * 2. Resolve extension name (bare name -> scope from settings)
 * 3. Validate managed pack exists with manifest
 * 4. Build plan with a single PublishPackOperation
 * 5. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { registryGuard } from "../../../sources/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { hasScopePrefix, parseScopedName } from "../../skills/naming.js";
import { publishPack, type PublishPackOperation } from "./publish-pack.js";
import { PACK_MANIFEST_FILENAME } from "../constants.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs publish command.
 */
export interface PublishPackHandlerArgs {
  /** Pack name (@scope/name or bare name). */
  readonly pack: string;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs publish` command.
 */
export const handlePublishPack = Effect.fn("PublishPack.handle")(function* (
  args: PublishPackHandlerArgs,
) {
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;
  const base = ws.baseDir;

  yield* log.info("axm packs publish");

  // Step 1: Registry guard
  yield* registryGuard;

  // Step 2: Resolve pack name
  const packName = yield* hasScopePrefix(args.pack)
    ? Effect.succeed(args.pack)
    : ws.getConfiguredScope().pipe(
        Effect.map((scope) => `${scope}/${args.pack}`),
        Effect.mapError((e) =>
          makeCliError({
            code: "SCOPE_RESOLUTION_FAILED",
            what: `Failed to resolve scope: ${e._tag}`,
            howToFix: "Configure a scope in your settings with `axm init`.",
            cause: e,
          }),
        ),
      );

  // Parse scope and pack name from the full name
  const { scope, name: shortName } = yield* parseScopedName(packName);

  // Step 3: Validate managed pack exists
  const handle = yield* spinnerSvc.start("Validating pack...");
  const packDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "packs", shortName);
  const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

  if (!packDirExists) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
        code: "EXTENSION_NOT_FOUND",
        what: `Managed pack not found: ${packName}`,
        details: [`Expected at: ${packDir}`],
        howToFix:
          "Only managed packs (in .axm/extensions/) can be published. Use `axm packs new` first.",
      }),
    );
  }

  // Validate manifest exists
  const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
  const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));

  if (!manifestExists) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
        code: "MISSING_MANIFEST",
        what: `Missing manifest: ${PACK_MANIFEST_FILENAME}`,
        details: [`Expected at: ${manifestPath}`],
        howToFix: "Ensure the pack has a valid axm-pack.json manifest.",
      }),
    );
  }

  yield* handle.stop(`Validated ${packName}`);

  // Step 4: Determine target registry
  const registrySources = yield* ws.getConfiguredRegistrySources(Option.none()).pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "REGISTRY_SOURCES_FAILED",
        what: `Failed to get registry sources: ${e._tag}`,
        cause: e,
      }),
    ),
  );

  if (registrySources.length === 0) {
    return yield* Effect.fail(
      makeCliError({
        code: "NO_REGISTRY_CONFIGURED",
        what: "No registry sources configured",
        howToFix: "Run the registry guard first.",
      }),
    );
  }

  const registryName = Option.match(args.registry, {
    onNone: () => registrySources[0]!.name,
    onSome: (name) => name,
  });

  // Step 5: Build plan with a single PublishPackOperation
  const steps: PlannedJobStep<PublishPackOperation>[] = [
    {
      _tag: "PlannedJobStep",
      operation: {
        name: "publish-pack",
        args: {
          name: packName,
          registryName,
        },
      } satisfies PublishPackOperation,
      expectedResult: { result: "success", message: `Published ${packName}` },
      label: `Publish ${packName}`,
    },
  ];

  const plan = {
    name: "Publish pack",
    description: Option.some(`Publish ${packName} to registry "${registryName}"`),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  yield* ws.resolvePlan(plan, {
    "publish-pack": publishPack,
  });

  yield* log.success("Done");
});
