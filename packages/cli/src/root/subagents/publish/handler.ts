import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/client-core/unstable/cli-runtime";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { PublishSubagentOperation } from "@agentxm/client-core/unstable/subagents";
import { publishSubagent, MANIFEST_FILENAME } from "@agentxm/client-core/unstable/subagents";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  REGISTRY_EXTENSIONS_DIR,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { expandGlobs, isGlobPattern } from "@agentxm/client-core/unstable/utils";
import {
  emitNoOpResult,
  emitPlanResolutionResult,
  planResolutionToSummary,
} from "../../../json-output.js";
import { publishSuccessRender } from "../../shared/publish-success.js";

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

    const installedSubagents = yield* ws.getLockedSubagents();
    const installedNames = Object.keys(installedSubagents);
    const globMatches = expandGlobs(globPatterns, installedNames);

    if (globPatterns.length === extensions.length && globMatches.length === 0) {
      yield* renderer.warn(`No subagents matched pattern "${globPatterns.join(", ")}"`);
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
        breadcrumbs: [{ description: "Run the registry guard first." }],
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
 * Handles the `axm subagents publish` command.
 */
export const handlePublish = Effect.fn("SubagentsPublish.handle")(function* (
  args: PublishHandlerArgs,
) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  yield* withAuthGuard(publishEffect(args, targetRegistry), {
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishEffect = Effect.fn("SubagentsPublish.publishEffect")(function* (
  args: PublishHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;

  const base = ws.baseDir;

  yield* renderer.info("axm subagents publish");

  // Step 1: Separate glob patterns from literal inputs, expand globs
  const resolvedNames = yield* resolveExtensionInputs(args.extensions);
  if (resolvedNames.length === 0) {
    if (
      yield* emitNoOpResult("subagents.publish", {
        planName: "Publish subagent",
        message: "Nothing to publish.",
      })
    ) {
      return;
    }
    yield* renderer.info("Nothing to publish.");
    return;
  }

  // Step 2: Resolve each name to FQN. Bare names look up the installed
  // subagent entry and parse its `source` to derive the owner.
  const configuredSubagents = yield* ws.records.getConfiguredSubagents();
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) => {
    if (name.startsWith("@") && name.includes("/")) return Effect.succeed(name);

    const entry = configuredSubagents[name];
    if (entry === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Subagent "${name}" is not installed in this workspace`,
          breadcrumbs: [
            {
              description:
                "Use the fully-qualified name `@owner/subagents/name`, or run `axm subagents new ${name}` to create it first.",
            },
          ],
        }),
      );
    }
    const parts = parseRegistrySourcePatternParts(entry.source);
    if (parts === undefined || parts.owner === undefined) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Subagent "${name}" cannot be published from a non-registry source`,
          breadcrumbs: [
            {
              description:
                "Only subagents sourced from a registry namespace (`@owner/subagents/name`) can be published.",
            },
          ],
        }),
      );
    }
    return Effect.succeed(`${parts.owner}/subagents/${name}`);
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
                detail: `Missing extension name for parsed FQN ${fqn.owner}/subagents/${fqn.name}`,
              }),
            );
          }
          const extensionDir = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            fqn.owner,
            "subagents",
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
                breadcrumbs: [
                  {
                    description:
                      "Only managed extensions (in .axm/extensions/) can be published. Scaffold a managed subagent with `axm subagents new` first.",
                  },
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
                breadcrumbs: [
                  {
                    description: `Ensure the extension has a valid ${MANIFEST_FILENAME} manifest.`,
                  },
                ],
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
      name: "publish-subagent",
      args: { name: extName, registryName: targetRegistry.registryName },
    } satisfies PublishSubagentOperation;

    return {
      readiness: "ready",
      label: `Publish ${extName}`,
      run: publishSubagent(op).pipe(
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
      : `Publish ${extensionNames.length} subagents to registry "${targetRegistry.registryName}"`;

  const plan: Plan = {
    _tag: "Plan",
    name: "Publish subagent",
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
  const failedStepDetails = failedStepErrors.map(
    (result) => `${result.message}: ${result.error.detail} (${result.error.code})`,
  );

  if (failedStepDetails.length > 0) {
    const [singleFailure] = failedStepErrors;
    if (
      failedStepErrors.length === 1 &&
      singleFailure !== undefined &&
      singleFailure.error.metadata?.response !== undefined
    ) {
      return yield* singleFailure.error;
    }

    const breadcrumbs =
      failedStepErrors.length === 1 && singleFailure !== undefined
        ? (singleFailure.error.breadcrumbs ?? [])
        : [];
    return yield* makeAppError({
      code: "internal",
      detail: `Failed to publish ${failedStepDetails.length} subagent${failedStepDetails.length === 1 ? "" : "s"}`,
      breadcrumbs,
    });
  }

  yield* setCommandSemanticProperties(
    summarizeCommandOutcome(
      planResolutionToSummary(resolvedPlan, {
        subjectType: "subagent",
        sourceKind: "registry",
      }),
    ),
  );
  yield* emitPlanResolutionResult("subagents.publish", resolvedPlan);
  const success = publishSuccessRender(resolvedPlan);
  yield* renderer.success(success.message, {
    ...(success.breadcrumbs !== undefined ? { breadcrumbs: success.breadcrumbs } : {}),
  });
});
