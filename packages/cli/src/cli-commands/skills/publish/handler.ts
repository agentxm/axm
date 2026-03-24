/**
 * Publish command handler -- Effect-based orchestration for `axm skills publish`.
 *
 * Publishes a managed extension from `.axm/extensions/` to a target registry:
 * 1. Resolve extension name (bare name -> profile from settings)
 * 2. Validate managed extension exists
 * 3. Build plan with a single PublishSkillOperation
 * 4. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { withAuthGuard } from "../../../auth/index.js";
import { makeAppError } from "../../../app-error/index.js";
import { Output } from "../../../output/index.js";
import { Activity } from "../../../activity/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { PublishSkillOperation } from "../../../extensions/skills/operations/publish.js";
import { publishSkill } from "../../../extensions/skills/operations/publish.js";
import { bridgeLegacyPlan, type LegacyPlannedStep } from "../../../workspace/plan-bridge.js";
import { MANIFEST_FILENAME, REGISTRY_EXTENSIONS_DIR, parseFqn } from "../../../extensions/index.js";
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
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const resolveExtensionInputs = (extensions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const output = yield* Output;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedSkills = yield* ws.getInstalledSkills();
    const installedNames = Object.keys(installedSkills);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      yield* output.warn(`No skills matched pattern "${globPatterns.join(", ")}"`);
      yield* output.success("Nothing to publish.");
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

  yield* withAuthGuard(publishEffect(args));
});

const publishEffect = Effect.fn("Publish.publishEffect")(function* (args: PublishHandlerArgs) {
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const output = yield* Output;
  const activity = yield* Activity;
  const base = ws.baseDir;

  yield* output.info("axm skills publish");

  // Step 1: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolveExtensionInputs(args.extensions);
  if (resolvedNames.length === 0) return;

  // Step 2: Resolve each name to FQN
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) =>
    name.startsWith("@") && name.includes("/")
      ? Effect.succeed(name)
      : ws.getConfiguredProfile().pipe(
          Effect.map((profile) => `${profile}/skills/${name}`),
          Effect.mapError((e) =>
            makeAppError({
              code: "NAMESPACE_RESOLUTION_FAILED",
              what: `Failed to resolve profile: ${e._tag}`,
              howToFix: "Configure a profile in your settings with `axm init`.",
              cause: e,
            }),
          ),
        ),
  );

  // Step 3: Validate each extension
  yield* activity.withSpinner(
    "Validating extensions...",
    () =>
      Effect.gen(function* () {
        const fqns = yield* Effect.forEach(extensionNames, (extName) => parseFqn(extName));

        yield* Effect.forEach(fqns, (fqn, i) => {
          const extName = extensionNames[i]!;
          const extensionDir = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            fqn.handle,
            "skills",
            fqn.name,
          );

          return Effect.gen(function* () {
            const extensionDirExists = yield* fs
              .exists(extensionDir)
              .pipe(Effect.orElseSucceed(() => false));

            if (!extensionDirExists) {
              return yield* Effect.fail(
                makeAppError({
                  code: "EXTENSION_NOT_FOUND",
                  what: `Managed extension not found: ${extName}`,
                  details: [`Expected at: ${extensionDir}`],
                  howToFix:
                    "Only managed extensions (in .axm/extensions/) can be published. Use `axm skills fork` first.",
                }),
              );
            }

            const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
            const manifestExists = yield* fs
              .exists(manifestPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!manifestExists) {
              return yield* Effect.fail(
                makeAppError({
                  code: "MISSING_MANIFEST",
                  what: `Missing manifest: ${MANIFEST_FILENAME}`,
                  details: [`Expected at: ${manifestPath}`],
                  howToFix: "Ensure the extension has a valid axm-skill.json manifest.",
                }),
              );
            }
          });
        });
      }),
    { successMessage: `Validated ${extensionNames.length} extension(s)` },
  );

  // Step 4: Determine target registry
  const registrySources = yield* ws.getRegistrySourceHosts().pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "REGISTRY_SOURCES_FAILED",
        what: `Failed to get registry sources: ${e._tag}`,
        cause: e,
      }),
    ),
  );

  if (registrySources.length === 0) {
    return yield* Effect.fail(
      makeAppError({
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

  // Step 5: Build multi-step plan
  const steps: LegacyPlannedStep<PublishSkillOperation>[] = extensionNames.map((extName) => ({
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

  const resolvedPlan = yield* ws.resolvePlan(
    bridgeLegacyPlan(plan, {
      "publish-skill": publishSkill,
    }),
  );

  const failedStepDetails = resolvedPlan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) =>
      step.result.result === "error"
        ? [`${step.label}: ${step.result.error.what} (${step.result.error.code})`]
        : [],
    );

  if (failedStepDetails.length > 0) {
    return yield* makeAppError({
      code: "PUBLISH_PLAN_FAILED",
      what: `Failed to publish ${failedStepDetails.length} skill${failedStepDetails.length === 1 ? "" : "s"}`,
      details: failedStepDetails,
    });
  }

  yield* output.success("Done");
});
