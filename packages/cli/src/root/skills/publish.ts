import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
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

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { PublishSkillOperation } from "@agentxm/client-core/unstable/skills";
import { publishSkill } from "@agentxm/client-core/unstable/skills";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  REGISTRY_EXTENSIONS_DIR,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { MANIFEST_FILENAME } from "@agentxm/client-core/unstable/skills";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import {
  emitNoOpResult,
  emitPlanResolutionResult,
  planResolutionToSummary,
} from "../../json-output.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";
import { publishSuccessRender } from "../shared/publish-success.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { ADD_REGISTRY_SOURCE, SCAFFOLD_MANAGED_SKILL } from "../suggested-actions.js";

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
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;

    const globPatterns = extensions.filter((e) => isGlobPattern(e));
    const literalInputs = extensions.filter((e) => !isGlobPattern(e));

    if (globPatterns.length === 0) return literalInputs;

    const installedSkills = yield* ws.records.getInstalledSkills();
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
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "usage",
        detail: "No registry sources configured",
        recover: "Add a registry source: `axm sources add <name> <url>`",
        cmd: ADD_REGISTRY_SOURCE.cmd,
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
          code: "internal",
          detail: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${registry.value}" not found or not a registry source`,
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
  if (args.preview) {
    yield* publishEffect(args, targetRegistry);
    return;
  }

  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("Publish.publishEffect")(function* (
  args: PublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;

  const base = ws.baseDir;

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

  // Step 2: Resolve each name to FQN. Bare names look up the installed skill
  // entry and parse its `source` to derive the owner.
  const configuredSkills = yield* ws.records.getConfiguredSkills();
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) => {
    if (name.startsWith("@") && name.includes("/")) return Effect.succeed(name);

    const entry = configuredSkills[name];
    if (entry === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Skill "${name}" is not installed in this workspace`,
          suggestions: [
            {
              description: "Use the fully-qualified name `@owner/skills/name`",
            },
            SCAFFOLD_MANAGED_SKILL,
          ],
        }),
      );
    }

    const parts = parseRegistrySourcePatternParts(entry.source);
    if (parts === undefined || parts.owner === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Skill "${name}" cannot be published from a non-registry source`,
          recover:
            "Only skills sourced from a registry namespace (`@owner/skills/name`) can be published",
        }),
      );
    }

    return Effect.succeed(`${parts.owner}/skills/${name}`);
  });

  // Step 3: Validate each extension
  yield* renderer.withSpinner(
    "Validating extensions...",
    () =>
      Effect.gen(function* () {
        const fqns = yield* Effect.forEach(extensionNames, (extName) =>
          Effect.fromResult(Result.mapError(parseFqn(extName), fqnInvalidErrorToAppError)),
        );

        yield* Effect.forEach(fqns, (fqn, i) => {
          const extName = extensionNames[i];
          if (extName === undefined) {
            return Effect.fail(
              makeAppError({
                code: "not_found",
                detail: `Missing extension name for parsed FQN ${fqn.owner}/skills/${fqn.name}`,
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
                code: "not_found",
                detail: `Managed extension not found: ${extName}`,
                suggestions: [
                  {
                    description: "Only managed extensions in `.axm/extensions/` can be published",
                  },
                  SCAFFOLD_MANAGED_SKILL,
                ],
              });
            }

            const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
            const manifestExists = yield* fs
              .exists(manifestPath)
              .pipe(Effect.orElseSucceed(() => false));

            if (!manifestExists) {
              return yield* makeAppError({
                code: "not_found",
                detail: `Missing manifest: ${MANIFEST_FILENAME}`,
                recover: `Ensure the extension has a valid \`${MANIFEST_FILENAME}\` manifest`,
              });
            }
          });
        });
      }),
    {
      successMessage: `Validated ${extensionNames.length} ${
        extensionNames.length === 1 ? "extension" : "extensions"
      }`,
    },
  );

  yield* renderer.withSpinner(
    "Checking published versions...",
    () =>
      Effect.forEach(
        extensionNames,
        (extName) =>
          checkPublishVersionPreflight({
            fqn: extName,
            type: "skill",
            registryName: targetRegistry.registryName,
            registryUrl: targetRegistry.registryUrl,
            force: args.force,
          }),
        { concurrency: "unbounded" },
      ),
    { successMessage: "Version check complete" },
  );

  // Step 4: Build multi-step plan with inline run closures
  const toJobStepResult = (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: import("@agentxm/client-core/unstable/app-error").AppError;
    readonly links?: { readonly html: string };
  }): JobStepResult =>
    result.result === "error" && result.error != null
      ? { result: "error", message: result.message, error: result.error }
      : {
          result: "success",
          message: result.message,
          ...(result.links !== undefined ? { links: result.links } : {}),
        };

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
        Effect.provideService(WorkspaceMutations, ws),
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

  const failedStepErrors =
    resolvedPlan._tag === "ExecutedPlan"
      ? resolvedPlan.jobs
          .flatMap((job) => job.steps)
          .flatMap((step) => (step.result.result === "error" ? [step.result] : []))
      : [];

  if (failedStepErrors.length > 0) {
    const [singleFailure] = failedStepErrors;
    if (
      failedStepErrors.length === 1 &&
      singleFailure !== undefined &&
      singleFailure.error.metadata?.response !== undefined
    ) {
      return yield* singleFailure.error;
    }

    return yield* makeAppError({
      code: "internal",
      detail: `Failed to publish ${failedStepErrors.length} skill${failedStepErrors.length === 1 ? "" : "s"}`,
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
  const success = publishSuccessRender(resolvedPlan);
  yield* renderer.success(success.message, {
    ...(success.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
  });
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
    Flag.withDescription("Bypass version-order warnings; published versions remain immutable"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would be published without uploading")),
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ extensions, registry, yes, force, preview }) => {
    const program = handlePublish({
      extensions: [...extensions],
      registry,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE));
    return program.pipe(Effect.provide(AuthLayer), withRuntime("skills publish"));
  },
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
