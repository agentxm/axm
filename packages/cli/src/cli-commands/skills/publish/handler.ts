/**
 * Publish command handler -- Effect-based orchestration for `axm skills publish`.
 *
 * Publishes a managed extension from `.axm/extensions/` to a target registry:
 * 1. Registry guard (ensure registry configured)
 * 2. Resolve extension name (bare name -> namespace from settings)
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
import type { PublishSkillOperation } from "../../../extensions/skills/operations/publish.js";
import { publishSkill } from "../../../extensions/skills/operations/publish.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { MANIFEST_FILENAME } from "../../../extensions/skills/manifest-schema.js";
import { parseFqn } from "../../../extensions/fqn.js";
import { expandGlobs, isGlobPattern } from "../../../skills/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the publish command.
 */
export interface PublishHandlerArgs {
  /** Extension names, FQNs, or glob patterns. */
  readonly extensions: ReadonlyArray<string>;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const resolveExtensionInputs = (extensions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedSkills = yield* ws.getInstalledSkills();
    const installedNames = Object.keys(installedSkills);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      yield* log.warn(`No skills matched pattern "${globPatterns.join(", ")}"`);
      yield* log.success("Nothing to publish.");
      return [] as ReadonlyArray<string>;
    }

    const seen = new Set<string>(globMatches);
    return [
      ...globMatches,
      ...literalInputs.filter((lit) => {
        if (seen.has(lit)) return false;
        seen.add(lit);
        return true;
      }),
    ];
  });

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

  // Step 2: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolveExtensionInputs(args.extensions);
  if (resolvedNames.length === 0) return;

  // Step 3: Resolve each name to FQN
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) =>
    name.startsWith("@") && name.includes("/")
      ? Effect.succeed(name)
      : ws.getConfiguredNamespace().pipe(
          Effect.map((namespace) => `${namespace}/skills/${name}`),
          Effect.mapError((e) =>
            makeCliError({
              code: "NAMESPACE_RESOLUTION_FAILED",
              what: `Failed to resolve namespace: ${e._tag}`,
              howToFix: "Configure a namespace in your settings with `axm init`.",
              cause: e,
            }),
          ),
        ),
  );

  // Step 4: Validate each extension
  const handle = yield* spinnerSvc.start("Validating extensions...");

  const fqns = yield* Effect.forEach(extensionNames, (extName) => parseFqn(extName));

  yield* Effect.forEach(fqns, (fqn, i) => {
    const extName = extensionNames[i]!;
    const extensionDir = path.join(
      base,
      REGISTRY_EXTENSIONS_DIR,
      fqn.namespace,
      "skills",
      fqn.name,
    );

    return Effect.gen(function* () {
      const extensionDirExists = yield* fs
        .exists(extensionDir)
        .pipe(Effect.orElseSucceed(() => false));

      if (!extensionDirExists) {
        yield* handle.stop("Failed");
        return yield* Effect.fail(
          makeCliError({
            code: "EXTENSION_NOT_FOUND",
            what: `Managed extension not found: ${extName}`,
            details: [`Expected at: ${extensionDir}`],
            howToFix:
              "Only managed extensions (in .axm/extensions/) can be published. Use `axm skills fork` first.",
          }),
        );
      }

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
    });
  });

  yield* handle.stop(`Validated ${extensionNames.length} extension(s)`);

  // Step 5: Determine target registry
  const registrySources = yield* ws.getConfiguredRegistrySources().pipe(
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

  // Step 6: Build multi-step plan
  const steps: PlannedJobStep<PublishSkillOperation>[] = extensionNames.map((extName) => ({
    _tag: "PlannedJobStep" as const,
    operation: {
      name: "publish-skill",
      args: { name: extName, registryName },
    } satisfies PublishSkillOperation,
    readiness: { status: "ready" as const, message: Option.none() },
    label: `Publish ${extName}`,
  }));

  const description =
    extensionNames.length === 1
      ? `Publish ${extensionNames[0]} to registry "${registryName}"`
      : `Publish ${extensionNames.length} skills to registry "${registryName}"`;

  const plan = {
    name: "Publish skill",
    description: Option.some(description),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  const resolvedPlan = yield* ws.resolvePlan(plan, {
    "publish-skill": publishSkill,
  });

  const failedCount = resolvedPlan.jobs
    .flatMap((job) => job.steps)
    .filter((step) => step._tag === "JobStepResult" && step.result.result === "error").length;

  if (failedCount > 0) {
    yield* log.warn("Done with errors");
    return;
  }

  yield* log.success("Done");
});
