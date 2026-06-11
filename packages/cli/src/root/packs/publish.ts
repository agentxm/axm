import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Job, JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  formatFqn,
  fqnInvalidErrorToAppError,
  parseFqn,
  parseFqnOrThrow,
  toExtensionTypePlural,
  type ExtensionFqnParts,
  REGISTRY_EXTENSIONS_DIR,
  decodeExtensionNameSync,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "@agentxm/client-core/unstable/packs";
import { publishSkill, type PublishSkillOperation } from "@agentxm/client-core/unstable/skills";
import {
  publishPack,
  type PublishPackOperation,
  computePackPaths,
} from "@agentxm/client-core/unstable/packs";
import {
  publishCommand as publishCommandOp,
  type PublishCommandOperation,
} from "@agentxm/client-core/unstable/commands";
import {
  publishMcpServer,
  type PublishMcpServerOperation,
} from "@agentxm/client-core/unstable/mcps";
import {
  publishSubagent,
  type PublishSubagentOperation,
} from "@agentxm/client-core/unstable/subagents";
import { publishHook, type PublishHookOperation } from "@agentxm/client-core/unstable/hooks";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import {
  forceFlag,
  previewFlag,
  Verbosity,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import { checkPublishVersionPreflight } from "../shared/publish-preflight.js";
import type { VersionableExtensionType } from "../shared/extension-version.js";
import { publishSuccessRender } from "../shared/publish-success.js";

export interface PublishPackHandlerArgs {
  readonly pack: string;
  readonly registry: Option.Option<string>;
  readonly includeDependencies: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

/**
 * Union of operation types used in the publish plan.
 */
export type PackPublishOp =
  | PublishPackOperation
  | PublishSkillOperation
  | PublishCommandOperation
  | PublishMcpServerOperation
  | PublishSubagentOperation
  | PublishHookOperation;

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

interface PublishVersionTarget {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
}

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
        suggestions: [{ description: "Run the registry guard first." }],
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
 * Handles the `axm packs publish` command.
 */
export const handlePublishPack = Effect.fn("PublishPack.handle")(function* (
  args: PublishPackHandlerArgs,
) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  if (args.preview) {
    yield* publishPackEffect(args, targetRegistry);
    return;
  }

  yield* withAuthGuard(publishPackEffect(args, targetRegistry), {
    registryUrl: targetRegistry.registryUrl,
  });
});

const publishPackEffect = Effect.fn("PublishPack.publishEffect")(function* (
  args: PublishPackHandlerArgs,
  targetRegistry: TargetRegistry,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;
  const base = ws.baseDir;

  // Capture services for run closures
  const provideServices = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | WorkspaceMutations>,
  ): Effect.Effect<A, E, never> =>
    effect.pipe(
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const toJobStepResult = (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: AppError;
    readonly links?: { readonly html: string };
  }): JobStepResult =>
    result.result === "error" && result.error !== undefined
      ? { result: "error", message: result.message, error: result.error }
      : {
          result: "success",
          message: result.message,
          ...(result.links !== undefined ? { links: result.links } : {}),
        };

  // Step 1: Resolve pack name. Bare names look up the configured pack entry
  // and parse its `source` to derive the owner.
  const hasOwner = args.pack.startsWith("@") && args.pack.includes("/");
  const packName = yield* (() => {
    if (hasOwner) return Effect.succeed(args.pack);

    return Effect.gen(function* () {
      const configuredPacks = yield* ws.records.getConfiguredPacks();
      const entry = configuredPacks[args.pack];
      if (entry === undefined) {
        return yield* makeAppError({
          code: "not_found",
          detail: `Pack "${args.pack}" is not installed in this workspace`,
          suggestions: [
            {
              description: "Use a fully-qualified pack name, or create the pack first.",
              cmd: `axm packs new ${args.pack}`,
            },
          ],
        });
      }
      const parts = parseRegistrySourcePatternParts(entry.source);
      if (parts === undefined || parts.owner === undefined) {
        return yield* makeAppError({
          code: "not_found",
          detail: `Pack "${args.pack}" cannot be published from a non-registry source`,
          suggestions: [
            {
              description:
                "Only packs sourced from a registry namespace (`@owner/packs/name`) can be published.",
            },
          ],
        });
      }
      return formatFqn({
        owner: parts.owner,
        type: "pack",
        name: decodeExtensionNameSync(args.pack),
      });
    });
  })();

  // Parse owner and pack name from the full name
  const fqn = yield* Result.mapError(parseFqn(packName), fqnInvalidErrorToAppError);

  // Step 2: Validate managed pack exists
  const manifestPath = yield* Effect.gen(function* () {
    const packDir = computePackPaths(path.join, base, fqn.owner, fqn.name).canonicalPath;
    const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

    if (!packDirExists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Managed pack not found: ${packName}`,
        suggestions: [
          {
            description: "Only managed packs in `.axm/extensions/` can be published.",
            cmd: "axm packs new <name>",
          },
        ],
      });
    }

    const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
    const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));

    if (!manifestExists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Missing manifest: ${PACK_MANIFEST_FILENAME}`,
        suggestions: [
          {
            description: `Ensure the pack has a valid ${PACK_MANIFEST_FILENAME} manifest.`,
          },
        ],
      });
    }

    return manifestPath;
  });

  // Step 3: Discover local dependencies (when --include-dependencies)
  const dependencySteps: PlannedJobStep[] = [];
  const skippedDependencySteps: PlannedJobStep[] = [];
  const versionTargets: PublishVersionTarget[] = [{ fqn: packName, type: "pack" }];

  if (args.includeDependencies) {
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const json = yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(manifestContent);
        return parsed;
      },
      catch: (e) =>
        makeAppError({
          code: "validation",
          detail: `Invalid JSON in pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "validation",
          detail: `Invalid pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const allDeps = Object.keys(manifest.dependencies);

    // Check which dependencies exist locally
    yield* Effect.forEach(
      allDeps,
      (depFqn) =>
        Effect.gen(function* () {
          const parsed = parseFqnOrThrow(depFqn);
          const depDir = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            parsed.owner,
            toExtensionTypePlural(parsed.type),
            parsed.name,
          );
          const exists = yield* fs.exists(depDir).pipe(Effect.orElseSucceed(() => false));

          if (exists) {
            switch (parsed.type) {
              case "skill":
              case "command":
              case "mcp-server":
              case "subagent":
              case "hook":
                versionTargets.push({ fqn: depFqn, type: parsed.type });
                break;
              case "pack":
              case "files":
              case "rule":
                break;
            }
            const step = yield* makeDependencyStep(
              parsed,
              depFqn,
              targetRegistry.registryName,
              provideServices,
              toJobStepResult,
            );
            dependencySteps.push(step);
          } else {
            skippedDependencySteps.push({
              readiness: "ready",
              label: `Skip ${depFqn}`,
              run: Effect.succeed({
                result: "success",
                message: `Skipped non-local dependency: ${depFqn}`,
                artifact: {
                  path: depFqn,
                  scope: ws.scope,
                  change: "unchanged",
                  targets: [{ path: depFqn, change: "unchanged" }],
                },
              } satisfies JobStepResult),
            });
          }
        }),
      { concurrency: "unbounded" },
    );
  }

  yield* Effect.forEach(
    versionTargets,
    (target) =>
      checkPublishVersionPreflight({
        fqn: target.fqn,
        type: target.type,
        registryName: targetRegistry.registryName,
        registryUrl: targetRegistry.registryUrl,
        force: args.force,
      }),
    { concurrency: "unbounded" },
  );

  // Step 4: Build plan with inline run closures
  const packOp: PublishPackOperation = {
    name: "publish-pack",
    args: {
      name: packName,
      registryName: targetRegistry.registryName,
    },
  };

  const packStep: PlannedJobStep = {
    readiness: "ready",
    label: `Publish ${packName}`,
    run: provideServices(publishPack(packOp)).pipe(Effect.map(toJobStepResult)),
  };

  const jobs: ReadonlyArray<Job> =
    dependencySteps.length > 0 || skippedDependencySteps.length > 0
      ? [
          { steps: [...dependencySteps, ...skippedDependencySteps], concurrency: "unbounded" },
          { steps: [packStep], concurrency: 1 as const },
        ]
      : [{ steps: [packStep], concurrency: 1 as const }];

  const plan: Plan = {
    _tag: "Plan",
    name: "Publish pack",
    description: Option.some(`Publish ${packName} to registry "${targetRegistry.registryName}"`),
    jobs,
  };

  const resolvedPlan = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
    displayApplied: false,
  });

  if (resolvedPlan._tag === "ExecutedPlan") {
    const failedStepErrors = resolvedPlan.jobs
      .flatMap((job) => job.steps)
      .flatMap((step) => (step.result.result === "error" ? [step.result] : []));

    if (failedStepErrors.length > 0) {
      const [singleFailure] = failedStepErrors;
      // A single failure already carries a fully-formed AppError from the
      // registry error mappers (code, detail, suggestions, response
      // metadata). Surface it directly rather than collapsing it into a
      // generic "Failed to publish" message that drops all of that context.
      if (failedStepErrors.length === 1 && singleFailure !== undefined) {
        return yield* singleFailure.error;
      }

      return yield* makeAppError({
        code: "internal",
        detail: `Failed to publish ${failedStepErrors.length} pack items`,
      });
    }
  }

  yield* setCommandSemanticProperties(
    summarizeCommandOutcome(
      planResolutionToSummary(resolvedPlan, {
        subjectType: "pack",
        sourceKind: "registry",
      }),
    ),
  );
  const success =
    resolvedPlan._tag === "ExecutedPlan" ? publishSuccessRender(resolvedPlan) : undefined;
  const emitted = yield* emitPlanResolutionResult("packs.publish", resolvedPlan, {
    ...(success?.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
  });
  if (emitted) {
    return;
  }

  if (success !== undefined) {
    yield* renderer.success(
      success.message,
      verbosity.level === "quiet"
        ? undefined
        : {
            ...(success.suggestions !== undefined ? { suggestions: success.suggestions } : {}),
          },
    );
  }
});

/** Create a per-type publish dependency step from a parsed FQN. */
const makeDependencyStep = (
  parsed: ExtensionFqnParts,
  depFqn: string,
  registryName: string,
  provideServices: <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | WorkspaceMutations>,
  ) => Effect.Effect<A, E, never>,
  toJobStepResult: (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: AppError;
    readonly links?: { readonly html: string };
  }) => JobStepResult,
): Effect.Effect<PlannedJobStep, AppError> => {
  const label = `Publish dependency ${depFqn}`;

  switch (parsed.type) {
    case "skill": {
      const op: PublishSkillOperation = {
        name: "publish-skill",
        args: { name: depFqn, registryName },
      };
      return Effect.succeed({
        readiness: "ready",
        label,
        run: provideServices(publishSkill(op)).pipe(Effect.map(toJobStepResult)),
      } satisfies PlannedJobStep);
    }
    case "command": {
      const op: PublishCommandOperation = {
        name: "publish-command",
        args: { name: depFqn, registryName },
      };
      return Effect.succeed({
        readiness: "ready",
        label,
        run: provideServices(publishCommandOp(op)).pipe(Effect.map(toJobStepResult)),
      } satisfies PlannedJobStep);
    }
    case "mcp-server": {
      const op: PublishMcpServerOperation = {
        name: "publish-mcp-server",
        args: { name: depFqn, registryName },
      };
      return Effect.succeed({
        readiness: "ready",
        label,
        run: provideServices(publishMcpServer(op)).pipe(Effect.map(toJobStepResult)),
      } satisfies PlannedJobStep);
    }
    case "subagent": {
      const op: PublishSubagentOperation = {
        name: "publish-subagent",
        args: { name: depFqn, registryName },
      };
      return Effect.succeed({
        readiness: "ready",
        label,
        run: provideServices(publishSubagent(op)).pipe(Effect.map(toJobStepResult)),
      } satisfies PlannedJobStep);
    }
    case "hook": {
      const op: PublishHookOperation = {
        name: "publish-hook",
        args: { name: depFqn, registryName },
      };
      return Effect.succeed({
        readiness: "ready",
        label,
        run: provideServices(publishHook(op)).pipe(Effect.map(toJobStepResult)),
      } satisfies PlannedJobStep);
    }
    case "pack":
      return Effect.fail(
        makeAppError({
          code: "internal",
          detail: `Pack dependencies of packs are not supported for publishing: ${depFqn}`,
        }),
      );
    case "files":
    case "rule":
      return Effect.fail(
        makeAppError({
          code: "internal",
          detail: `Publishing ${parsed.type} from pack dependencies is not supported: ${depFqn}`,
        }),
      );
  }
};

const publishConfig = {
  pack: Argument.string("pack").pipe(
    Argument.withDescription("Pack FQN (@owner/packs/name) or bare pack name"),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  includeDependencies: Flag.boolean("include-dependencies").pipe(
    Flag.withAlias("d"),
    Flag.withDescription("Also publish local extensions referenced by the pack"),
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
  ({ pack, registry, includeDependencies, yes, force, preview }) => {
    const program = handlePublishPack({
      pack,
      registry,
      includeDependencies,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE));
    return program.pipe(Effect.provide(AuthLayer), withRuntime("packs publish"));
  },
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish a pack to a registry"),
  Command.withExamples([
    {
      command: "axm packs publish @acme/packs/frontend-tools",
      description: "Share your pack on the registry",
    },
    {
      command: "axm packs publish frontend-tools --registry local",
      description: "Publish to a specific registry",
    },
    {
      command: "axm packs publish @acme/packs/frontend-tools --include-dependencies",
      description: "Also publish the pack's local dependency extensions",
    },
  ]),
);
