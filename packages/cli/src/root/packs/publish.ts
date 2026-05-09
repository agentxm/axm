import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@agentxm/client-core/unstable/auth";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { Job, JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import {
  formatFqn,
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
} from "@agentxm/client-core/unstable/mcp-servers";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult, planResolutionToSummary } from "../../json-output.js";
import { withAuthRuntime, withWorkspace } from "../../runtime.js";

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
  | PublishMcpServerOperation;

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

const resolveTargetRegistry = (registry: Option.Option<string>) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const registrySources = yield* ws.getRegistrySourceHosts().pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          message: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );

    const [defaultRegistry] = registrySources;
    if (defaultRegistry === undefined) {
      return yield* makeAppError({
        code: "usage",
        message: "No registry sources configured",
        breadcrumbs: [{ task: "Recover", description: "Run the registry guard first." }],
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
          message: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        message: `Registry source "${registry.value}" not found or not a registry source`,
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
  const base = ws.baseDir;

  yield* renderer.info("axm packs publish");

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
  }): JobStepResult =>
    result.result === "error" && result.error !== undefined
      ? { result: "error", message: result.message, error: result.error }
      : { result: "success", message: result.message };

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
          message: `Pack "${args.pack}" is not installed in this workspace`,
          breadcrumbs: [
            {
              task: "Recover",
              description:
                "Use the fully-qualified name `@owner/packs/name`, or run `axm packs new ${args.pack}` to create it first.",
            },
          ],
        });
      }
      const parts = parseRegistrySourcePatternParts(entry.source);
      if (parts === undefined || parts.owner === undefined) {
        return yield* makeAppError({
          code: "not_found",
          message: `Pack "${args.pack}" cannot be published from a non-registry source`,
          breadcrumbs: [
            {
              task: "Recover",
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
  const fqn = yield* parseFqn(packName);

  // Step 2: Validate managed pack exists
  const manifestPath = yield* renderer.withSpinner(
    "Validating pack...",
    () =>
      Effect.gen(function* () {
        const packDir = computePackPaths(path.join, base, fqn.owner, fqn.name).canonicalPath;
        const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

        if (!packDirExists) {
          return yield* makeAppError({
            code: "not_found",
            message: `Managed pack not found: ${packName}`,
            breadcrumbs: [
              {
                task: "Recover",
                description:
                  "Only managed packs (in .axm/extensions/) can be published. Use `axm packs new` first.",
              },
            ],
          });
        }

        // Validate manifest exists
        const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
        const manifestExists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!manifestExists) {
          return yield* makeAppError({
            code: "not_found",
            message: `Missing manifest: ${PACK_MANIFEST_FILENAME}`,
            breadcrumbs: [
              {
                task: "Recover",
                description: `Ensure the pack has a valid ${PACK_MANIFEST_FILENAME} manifest.`,
              },
            ],
          });
        }

        return manifestPath;
      }),
    { successMessage: `Validated ${packName}` },
  );

  // Step 3: Discover local dependencies (when --include-dependencies)
  const dependencySteps: PlannedJobStep[] = [];

  if (args.includeDependencies) {
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          message: `Failed to read pack manifest: ${manifestPath}`,
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
          message: `Invalid JSON in pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "validation",
          message: `Invalid pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // Collect all dependency FQNs from skills, commands, mcp-servers
    const allDeps: ReadonlyArray<string> = [
      ...Object.keys(manifest.skills ?? {}),
      ...Object.keys(manifest.commands ?? {}),
      ...Object.keys(manifest["mcp-servers"] ?? {}),
    ];

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
            const step = yield* makeDependencyStep(
              parsed,
              depFqn,
              targetRegistry.registryName,
              provideServices,
              toJobStepResult,
            );
            dependencySteps.push(step);
          } else {
            yield* renderer.warn(`Skipping non-local dependency: ${depFqn}`);
          }
        }),
      { concurrency: "unbounded" },
    );
  }

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
    dependencySteps.length > 0
      ? [
          { steps: dependencySteps, concurrency: "unbounded" as const },
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
  });

  if (resolvedPlan._tag === "ExecutedPlan") {
    const failedStepDetails = resolvedPlan.jobs
      .flatMap((job) => job.steps)
      .flatMap((step) =>
        step.result.result === "error"
          ? [`${step.label}: ${step.result.error.message} (${step.result.error.code})`]
          : [],
      );

    if (failedStepDetails.length > 0) {
      return yield* makeAppError({
        code: "internal",
        message: `Failed to publish ${failedStepDetails.length} pack item${failedStepDetails.length === 1 ? "" : "s"}`,
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
  yield* emitPlanResolutionResult("packs.publish", resolvedPlan);

  yield* renderer.success("Done");
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
    case "pack":
      return Effect.fail(
        makeAppError({
          code: "internal",
          message: `Pack dependencies of packs are not supported for publishing: ${depFqn}`,
        }),
      );
    case "subagent":
    case "file":
    case "rule":
      return Effect.fail(
        makeAppError({
          code: "internal",
          message: `Publishing ${parsed.type} from pack dependencies is not supported: ${depFqn}`,
        }),
      );
  }
};

const publishConfig = {
  pack: Argument.string("pack").pipe(
    Argument.withDescription("Pack name (@owner/name or bare name)"),
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
    Flag.withDescription("Publish even if this version already exists in the registry"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show what would be published without uploading")),
} as const;

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ pack, registry, includeDependencies, yes, force, preview }) =>
    handlePublishPack({ pack, registry, includeDependencies, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withAuthRuntime("packs publish"),
    ),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish a pack to a registry"),
  Command.withExamples([
    {
      command: "axm packs publish @acme/frontend-tools",
      description: "Share your pack on the registry",
    },
    {
      command: "axm packs publish frontend-tools --registry local",
      description: "Publish to a specific registry",
    },
    {
      command: "axm packs publish @acme/frontend-tools --include-dependencies",
      description: "Also publish the pack's local dependency extensions",
    },
  ]),
);
