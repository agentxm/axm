/**
 * Publish command handler -- Effect-based orchestration for `axm skills publish`.
 *
 * Publishes a managed extension from `.axm/extensions/` to a target registry:
 * 1. Registry guard (ensure registry configured)
 * 2. Resolve extension name (bare name -> scope from settings)
 * 3. Validate managed extension exists
 * 4. Build plan with a single PublishSkillOperation
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
import type { PublishSkillOperation } from "../operations.js";
import { publishSkill } from "../publish-skill.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { MANIFEST_FILENAME } from "../constants.js";
import { hasScopePrefix, parseScopedName } from "../naming.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the publish command.
 */
export interface PublishHandlerArgs {
  /** Extension name (@scope/name or bare name). */
  readonly extension: string;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills publish` command.
 */
export const handlePublish = Effect.fn("Publish.handle")(function* (args: PublishHandlerArgs) {
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;
  const base = ws.baseDir;

  yield* log.info("axm skills publish");

  // Step 1: Registry guard
  yield* registryGuard;

  // Step 2: Resolve extension name
  const extensionName = yield* hasScopePrefix(args.extension)
    ? Effect.succeed(args.extension)
    : ws.getConfiguredScope().pipe(
        Effect.map((scope) => `${scope}/${args.extension}`),
        Effect.mapError((e) =>
          makeCliError({
            code: "SCOPE_RESOLUTION_FAILED",
            what: `Failed to resolve scope: ${e._tag}`,
            howToFix: "Configure a scope in your settings with `axm init`.",
            cause: e,
          }),
        ),
      );

  // Parse scope and skill name from the extension name
  const { scope, name: skillName } = yield* parseScopedName(extensionName);

  // Step 3: Validate managed extension exists
  const handle = yield* spinnerSvc.start("Validating extension...");
  const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "skills", skillName);
  const extensionDirExists = yield* fs.exists(extensionDir).pipe(Effect.orElseSucceed(() => false));

  if (!extensionDirExists) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
        code: "EXTENSION_NOT_FOUND",
        what: `Managed extension not found: ${extensionName}`,
        details: [`Expected at: ${extensionDir}`],
        howToFix:
          "Only managed extensions (in .axm/extensions/) can be published. Use `axm skills fork` first.",
      }),
    );
  }

  // Validate manifest exists
  const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
  const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));

  if (!manifestExists) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
        code: "MISSING_MANIFEST",
        what: `Missing manifest: ${MANIFEST_FILENAME}`,
        details: [`Expected at: ${manifestPath}`],
        howToFix: "Ensure the extension has a valid axm-skill.json manifest.",
      }),
    );
  }

  yield* handle.stop(`Validated ${extensionName}`);

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

  // Step 5: Build plan with a single PublishSkillOperation
  const steps: PlannedJobStep<PublishSkillOperation>[] = [
    {
      _tag: "PlannedJobStep",
      operation: {
        name: "publish-skill",
        args: {
          name: extensionName,
          registryName,
        },
      } satisfies PublishSkillOperation,
      expectedResult: { result: "success", message: `Published ${extensionName}` },
      label: `Publish ${extensionName}`,
    },
  ];

  const plan = {
    name: "Publish skill",
    description: Option.some(`Publish ${extensionName} to registry "${registryName}"`),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  yield* ws.resolvePlan(plan, {
    "publish-skill": publishSkill,
  });

  yield* log.success("Done");
});
