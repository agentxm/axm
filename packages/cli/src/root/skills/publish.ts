import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";

import { Workspace } from "@agentxm/client-core/unstable/workspace";
import type { PublishSkillOperation } from "@agentxm/client-core/unstable/skills";
import { publishSkill } from "@agentxm/client-core/unstable/skills";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { REGISTRY_EXTENSIONS_DIR, parseFqn } from "@agentxm/client-core/unstable/extensions";
import { MANIFEST_FILENAME } from "@agentxm/client-core/unstable/skills";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import {
  emitNoOpResult,
  emitPlanResolutionResult,
  planResolutionToSummary,
} from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";

export interface PublishHandlerArgs {
  readonly extensions: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

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
      return yield* makeAppError({
        code: "NO_REGISTRY_CONFIGURED",
        what: "No registry sources configured",
        howToFix: "Run the registry guard first.",
      });
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
      return yield* makeAppError({
        code: "PUBLISH_SKILL_REGISTRY_NOT_FOUND",
        what: `Registry source "${registry.value}" not found or not a registry source`,
      });
    }

    return {
      registryName: registry.value,
      registryUrl: namedRegistry.value.location.href,
    } satisfies TargetRegistry;
  });

/**
 * Handles the `axm skills publish` command.
 */
export const handlePublish = Effect.fn("Publish.handle")(function* (args: PublishHandlerArgs) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  yield* withAuthGuard(publishEffect(args, targetRegistry), {
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
  if (resolvedNames.length === 0) {
    if (
      yield* emitNoOpResult("skills.publish", {
        planName: "Publish skill",
        message: "Nothing to publish.",
      })
    ) {
      return;
    }
    yield* renderer.info("Nothing to publish.");
    return;
  }

  // Step 2: Resolve each name to FQN
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) =>
    name.startsWith("@") && name.includes("/")
      ? Effect.succeed(name)
      : ws.getConfiguredProfile().pipe(
          Effect.map((owner) => `${owner}/skills/${name}`),
          Effect.mapError((e) =>
            makeAppError({
              code: "NAMESPACE_RESOLUTION_FAILED",
              what: `Failed to resolve owner: ${e._tag}`,
              howToFix: "Configure an owner in your settings with `axm init`.",
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
                what: `Missing extension name for parsed FQN ${fqn.owner}/skills/${fqn.name}`,
              }),
            );
          }
          const extensionDir = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            fqn.owner,
            "skills",
            fqn.name,
          );

          return Effect.gen(function* () {
            const extensionDirExists = yield* fs
              .exists(extensionDir)
              .pipe(Effect.orElseSucceed(() => false));

            if (!extensionDirExists) {
              return yield* makeAppError({
                code: "EXTENSION_NOT_FOUND",
                what: `Managed extension not found: ${extName}`,
                details: [`Expected at: ${extensionDir}`],
                howToFix:
                  "Only managed extensions (in .axm/extensions/) can be published. Use `axm skills fork` first.",
              });
            }

            const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
            const manifestExists = yield* fs
              .exists(manifestPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!manifestExists) {
              return yield* makeAppError({
                code: "MISSING_MANIFEST",
                what: `Missing manifest: ${MANIFEST_FILENAME}`,
                details: [`Expected at: ${manifestPath}`],
                howToFix: `Ensure the extension has a valid ${MANIFEST_FILENAME} manifest.`,
              });
            }
          });
        });
      }),
    { successMessage: `Validated ${extensionNames.length} extension(s)` },
  );

  // Step 4: Build multi-step plan with inline run closures
  const toJobStepResult = (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: import("@agentxm/client-core/unstable/app-error").AppError;
  }): JobStepResult =>
    result.result === "error" && result.error != null
      ? { result: "error", message: result.message, error: result.error }
      : { result: "success", message: result.message };

  const steps: PlannedJobStep[] = extensionNames.map((extName): PlannedJobStep => {
    const op = {
      name: "publish-skill",
      args: { name: extName, registryName: targetRegistry.registryName },
    } satisfies PublishSkillOperation;

    return {
      readiness: "ready",
      label: `Publish ${extName}`,
      run: publishSkill(op).pipe(
        Effect.map(toJobStepResult),
        Effect.provideService(Workspace, ws),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
    };
  });

  const description =
    extensionNames.length === 1
      ? `Publish ${extensionNames[0]} to registry "${targetRegistry.registryName}"`
      : `Publish ${extensionNames.length} skills to registry "${targetRegistry.registryName}"`;

  const plan: Plan = {
    _tag: "Plan",
    name: "Publish skill",
    description: Option.some(description),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  const resolvedPlan = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  const failedStepDetails =
    resolvedPlan._tag === "ExecutedPlan"
      ? resolvedPlan.jobs
          .flatMap((job) => job.steps)
          .flatMap((step) =>
            step.result.result === "error"
              ? [`${step.label}: ${step.result.error.what} (${step.result.error.code})`]
              : [],
          )
      : [];

  if (failedStepDetails.length > 0) {
    return yield* makeAppError({
      code: "PUBLISH_PLAN_FAILED",
      what: `Failed to publish ${failedStepDetails.length} skill${failedStepDetails.length === 1 ? "" : "s"}`,
      details: failedStepDetails,
    });
  }

  yield* setCommandSemanticProperties(
    summarizeCommandOutcome(
      planResolutionToSummary(resolvedPlan, {
        subjectType: "skill",
        sourceKind: "registry",
      }),
    ),
  );
  yield* emitPlanResolutionResult("skills.publish", resolvedPlan);
  yield* renderer.success("Done");
});

const publishConfig = {
  extensions: Argument.string("extensions").pipe(
    Argument.withDescription(
      "Extension names or glob patterns (@owner/skills/name, bare name, or glob)",
    ),
    Argument.atLeast(1),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Publish even if version already exists in the registry"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would be published without uploading")),
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview }) =>
    handlePublish({ extensions: [...extensions], registry, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withAuthRuntime("skills publish"),
    ),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish extensions to a registry"),
  Command.withExamples([
    {
      command: "axm skills publish @acme/skills/code-review",
      description: "Publish a skill to the registry",
    },
    {
      command: "axm skills publish effect-* commit",
      description: "Publish multiple skills matching a pattern",
    },
    {
      command: "axm skills publish code-review --registry local",
      description: "Publish to a specific registry",
    },
  ]),
);
