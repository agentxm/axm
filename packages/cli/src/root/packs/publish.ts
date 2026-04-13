import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withAuthGuard } from "@axm.sh/core/unstable/auth";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { Job, JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import {
  formatFqn,
  parseFqn,
  parseFqnOrThrow,
  toExtensionTypePlural,
  type FullyQualifiedNameParts,
  REGISTRY_EXTENSIONS_DIR,
  decodeExtensionNameSync,
} from "@axm.sh/core/unstable/extensions";
import {
  EXTENSION_PACK_MANIFEST_FILENAME,
  ExtensionPackManifestSchema,
} from "@axm.sh/core/unstable/packs";
import { publishSkill, type PublishSkillOperation } from "@axm.sh/core/unstable/skills";
import {
  publishExtensionPack,
  type PublishExtensionPackOperation,
  computeExtensionPackPaths,
} from "@axm.sh/core/unstable/packs";
import {
  publishCommand as publishCommandOp,
  type PublishCommandOperation,
} from "@axm.sh/core/unstable/commands";
import {
  publishMcpServer,
  type PublishMcpServerOperation,
} from "@axm.sh/core/unstable/mcp-servers";
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import {
  setCommandSemanticProperties,
  summarizeCommandOutcome,
  withArgvTracking,
} from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
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
  | PublishExtensionPackOperation
  | PublishSkillOperation
  | PublishCommandOperation
  | PublishMcpServerOperation;

interface TargetRegistry {
  readonly registryName: string;
  readonly registryUrl: string;
}

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
          code: "PUBLISH_PACK_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${registry.value}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(namedRegistry) || namedRegistry.value.type !== "registry") {
      return yield* makeAppError({
        code: "PUBLISH_PACK_REGISTRY_NOT_FOUND",
        what: `Registry source "${registry.value}" not found or not a registry source`,
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
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;
  const base = ws.baseDir;

  yield* renderer.info("axm packs publish");

  // Capture services for run closures
  const provideServices = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Workspace>,
  ): Effect.Effect<A, E, never> =>
    effect.pipe(
      Effect.provideService(Workspace, ws),
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

  // Step 1: Resolve pack name
  const hasProfile = args.pack.startsWith("@") && args.pack.includes("/");
  const packName = yield* hasProfile
    ? Effect.succeed(args.pack)
    : ws.getConfiguredProfile().pipe(
        Effect.map((owner) =>
          formatFqn({ owner, type: "pack", name: decodeExtensionNameSync(args.pack) }),
        ),
        Effect.mapError((e) =>
          makeAppError({
            code: "NAMESPACE_RESOLUTION_FAILED",
            what: `Failed to resolve owner: ${e._tag}`,
            howToFix: "Configure an owner in your settings with `axm init`.",
            cause: e,
          }),
        ),
      );

  // Parse owner and pack name from the full name
  const fqn = yield* parseFqn(packName);

  // Step 2: Validate managed pack exists
  const manifestPath = yield* renderer.withSpinner(
    "Validating extension pack...",
    () =>
      Effect.gen(function* () {
        const packDir = computeExtensionPackPaths(
          path.join,
          base,
          fqn.owner,
          fqn.name,
        ).canonicalPath;
        const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

        if (!packDirExists) {
          return yield* makeAppError({
            code: "EXTENSION_NOT_FOUND",
            what: `Managed extension pack not found: ${packName}`,
            details: [`Expected at: ${packDir}`],
            howToFix:
              "Only managed extension packs (in .axm/extensions/) can be published. Use `axm packs new` first.",
          });
        }

        // Validate manifest exists
        const manifestPath = path.join(packDir, EXTENSION_PACK_MANIFEST_FILENAME);
        const manifestExists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!manifestExists) {
          return yield* makeAppError({
            code: "MISSING_MANIFEST",
            what: `Missing manifest: ${EXTENSION_PACK_MANIFEST_FILENAME}`,
            details: [`Expected at: ${manifestPath}`],
            howToFix: `Ensure the pack has a valid ${EXTENSION_PACK_MANIFEST_FILENAME} manifest.`,
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
          code: "PACK_MANIFEST_READ_FAILED",
          what: `Failed to read extension pack manifest: ${manifestPath}`,
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
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(ExtensionPackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_MANIFEST_INVALID",
          what: `Invalid extension pack manifest: ${manifestPath}`,
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
  const packOp: PublishExtensionPackOperation = {
    name: "publish-pack",
    args: {
      name: packName,
      registryName: targetRegistry.registryName,
    },
  };

  const packStep: PlannedJobStep = {
    readiness: "ready",
    label: `Publish ${packName}`,
    run: provideServices(publishExtensionPack(packOp)).pipe(Effect.map(toJobStepResult)),
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
    name: "Publish extension pack",
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
          ? [`${step.label}: ${step.result.error.what} (${step.result.error.code})`]
          : [],
      );

    if (failedStepDetails.length > 0) {
      return yield* makeAppError({
        code: "PUBLISH_PLAN_FAILED",
        what: `Failed to publish ${failedStepDetails.length} extension pack item${failedStepDetails.length === 1 ? "" : "s"}`,
        details: failedStepDetails,
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
  parsed: FullyQualifiedNameParts,
  depFqn: string,
  registryName: string,
  provideServices: <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Workspace>,
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
          code: "PACK_DEPENDENCY_UNSUPPORTED",
          what: `Extension pack dependencies of extension packs are not supported for publishing: ${depFqn}`,
        }),
      );
    case "subagent":
    case "file":
    case "rule":
      return Effect.fail(
        makeAppError({
          code: "PACK_DEPENDENCY_UNSUPPORTED",
          what: `Publishing ${parsed.type} from pack dependencies is not supported: ${depFqn}`,
        }),
      );
  }
};

const publishConfig = {
  pack: Argument.string("pack").pipe(
    Argument.withDescription("Extension pack name (@owner/name or bare name)"),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry instead of the default"),
    Flag.optional,
  ),
  includeDependencies: Flag.boolean("include-dependencies").pipe(
    Flag.withAlias("d"),
    Flag.withDescription("Also publish local extensions referenced by the extension pack"),
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
  Command.withDescription("Publish an extension pack to a registry"),
  Command.withExamples([
    {
      command: "axm packs publish @acme/frontend-tools",
      description: "Share your extension pack on the registry",
    },
    {
      command: "axm packs publish frontend-tools --registry local",
      description: "Publish to a specific registry",
    },
    {
      command: "axm packs publish @acme/frontend-tools --include-dependencies",
      description: "Also publish the extension pack's local dependency extensions",
    },
  ]),
);
