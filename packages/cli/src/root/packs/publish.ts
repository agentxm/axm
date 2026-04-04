/**
 * Publish command handler -- Effect-based orchestration for `axm packs publish`.
 *
 * Publishes a pack from `.axm/extensions/` to a target registry:
 * 1. Resolve extension name (bare name -> owner from settings)
 * 2. Validate managed pack exists with manifest
 * 3. Discover local dependencies (when --include-dependencies)
 * 4. Build plan (dependency job + pack job, or pack-only)
 * 5. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

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
  type Fqn,
  REGISTRY_EXTENSIONS_DIR,
} from "@axm.sh/core/unstable/extensions";
import { PACK_MANIFEST_FILENAME, RawPackManifestSchema } from "@axm.sh/core/unstable/packs";
import { publishSkill, type PublishSkillOperation } from "@axm.sh/core/unstable/skills";
import {
  publishPack,
  type PublishPackOperation,
  computePackPaths,
} from "@axm.sh/core/unstable/packs";
import {
  publishCommand as publishCommandOp,
  type PublishCommandOperation,
} from "@axm.sh/core/unstable/commands";
import {
  publishMcpServer,
  type PublishMcpServerOperation,
} from "@axm.sh/core/unstable/mcp-servers";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { authCommandMeta, annotateCommandMeta, withCommandRuntime } from "../../command-meta.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withWorkspace } from "../../runtime.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs publish command.
 */
export interface PublishPackHandlerArgs {
  /** Pack name (@owner/name or bare name). */
  readonly pack: string;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Publish locally managed dependency extensions alongside the pack. */
  readonly includeDependencies: boolean;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
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

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs publish` command.
 */
export const handlePublishPack = Effect.fn("PublishPack.handle")(function* (
  args: PublishPackHandlerArgs,
) {
  const targetRegistry = yield* resolveTargetRegistry(args.registry);
  yield* withAuthGuard(publishPackEffect(args, targetRegistry), {
    yes: args.yes,
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
        Effect.map((owner) => formatFqn({ owner, type: "packs", name: args.pack })),
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
    "Validating pack...",
    () =>
      Effect.gen(function* () {
        const packDir = computePackPaths(path.join, base, fqn.owner, fqn.name).canonicalPath;
        const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

        if (!packDirExists) {
          return yield* makeAppError({
            code: "EXTENSION_NOT_FOUND",
            what: `Managed pack not found: ${packName}`,
            details: [`Expected at: ${packDir}`],
            howToFix:
              "Only managed packs (in .axm/extensions/) can be published. Use `axm packs new` first.",
          });
        }

        // Validate manifest exists
        const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
        const manifestExists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!manifestExists) {
          return yield* makeAppError({
            code: "MISSING_MANIFEST",
            what: `Missing manifest: ${PACK_MANIFEST_FILENAME}`,
            details: [`Expected at: ${manifestPath}`],
            howToFix: "Ensure the pack has a valid axm-pack.json manifest.",
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
          what: `Failed to read pack manifest: ${manifestPath}`,
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
          what: `Invalid JSON in pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(RawPackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_MANIFEST_INVALID",
          what: `Invalid pack manifest: ${manifestPath}`,
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
            parsed.type,
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

  const resolvedPlan = yield* resolvePlan(plan, {
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
        what: `Failed to publish ${failedStepDetails.length} pack item${failedStepDetails.length === 1 ? "" : "s"}`,
        details: failedStepDetails,
      });
    }
  }

  yield* emitPlanResolutionResult("packs.publish", resolvedPlan);

  yield* renderer.success("Done");
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create a per-type publish dependency step from a parsed FQN. */
const makeDependencyStep = (
  parsed: Fqn,
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
    case "skills": {
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
    case "commands": {
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
    case "mcp-servers": {
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
    case "packs":
      return Effect.fail(
        makeAppError({
          code: "PACK_DEPENDENCY_UNSUPPORTED",
          what: `Pack dependencies of packs are not supported for publishing: ${depFqn}`,
        }),
      );
  }
};

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

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
const commandMeta = authCommandMeta("packs publish", { json: true });

export const publishCommand = Command.make(
  "publish",
  publishConfig,
  ({ pack, registry, includeDependencies, yes, force, preview }) =>
    handlePublishPack({ pack, registry, includeDependencies, yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(publishConfig),
  annotateCommandMeta(commandMeta),
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
    {
      command: "",
      description: "See also: packs new, packs add",
    },
  ]),
);
