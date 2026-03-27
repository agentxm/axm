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
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

import { Workspace } from "../../../workspace/index.js";
import type { PublishSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import { publishSkill } from "@axm.sh/core/unstable/extension-managers";
import { bridgeLegacyPlan, type LegacyPlannedStep } from "../../../workspace/plan-bridge.js";
import {
  MANIFEST_FILENAME,
  REGISTRY_EXTENSIONS_DIR,
  parseFqn,
} from "@axm.sh/core/unstable/extensions";
import { expandGlobs, isGlobPattern } from "@axm.sh/core/unstable/utils";
import { resolvePlan } from "../../../workspace/resolve-plan.js";

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
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const resolveExtensionInputs = (extensions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedSkills = yield* ws.getInstalledSkills();
    const installedNames = Object.keys(installedSkills);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      yield* renderer.warn(`No skills matched pattern "${globPatterns.join(", ")}"`);
      yield* renderer.success("Nothing to publish.");
      return [];
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

const resolveTargetRegistry = (registry: Option.Option<string>) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "REGISTRY_SOURCES_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* Effect.fail(
        makeAppError({
          code: "NO_REGISTRY_CONFIGURED",
          what: "No registry sources configured",
          howToFix: "Run the registry guard first.",
        }),
      );
    }

    if (Option.isNone(registry)) {
      return {
        registryName: defaultRegistry.name,
        registryUrl: defaultRegistry.location.href,
      } satisfies TargetRegistry;
    }

    const namedRegistry = yield* ws.getConfiguredSourceByName(registry.value).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_SKILL_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* Effect.fail(
        makeAppError({
          code: "PUBLISH_SKILL_REGISTRY_NOT_FOUND",
          what: `Registry source "${registry.value}" not found or not a registry source`,
        }),
      );
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills publish` command.
 */
export const handlePublish = Effect.fn("Publish.handle")(function* (args: PublishHandlerArgs) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    yes: args.yes,
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("Publish.publishEffect")(function* (
  args: PublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;

  const base = ws.baseDir;

  yield* renderer.info("axm skills publish");

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
  yield* renderer.withSpinner(
    "Validating extensions...",
    () =>
      Effect.gen(function* () {
        const fqns = yield* Effect.forEach(extensionNames, (extName) => parseFqn(extName));

        yield* Effect.forEach(fqns, (fqn, i) => {
          const extName = extensionNames[i];
          if (extName === undefined) {
            return Effect.fail(
              makeAppError({
                code: "EXTENSION_NOT_FOUND",
                what: `Missing extension name for parsed FQN ${fqn.handle}/skills/${fqn.name}`,
              }),
            );
          }
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

  // Step 4: Build multi-step plan
  const steps: LegacyPlannedStep<PublishSkillOperation>[] = extensionNames.map((extName) => ({
    _tag: "PlannedJobStep" as const,
    operation: {
      name: "publish-skill",
      args: { name: extName, registryName: targetRegistry.registryName },
    } satisfies PublishSkillOperation,
    readiness: { status: "ready" as const, message: Option.none() },
    label: `Publish ${extName}`,
  }));

  const description =
    extensionNames.length === 1
      ? `Publish ${extensionNames[0]} to registry "${targetRegistry.registryName}"`
      : `Publish ${extensionNames.length} skills to registry "${targetRegistry.registryName}"`;

  const plan = {
    name: "Publish skill",
    description: Option.some(description),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  const resolvedPlan = yield* resolvePlan(
    bridgeLegacyPlan(plan, {
      "publish-skill": publishSkill,
    }),
    { yes: args.yes, force: args.force, preview: args.preview },
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

  yield* renderer.success("Done");
});
