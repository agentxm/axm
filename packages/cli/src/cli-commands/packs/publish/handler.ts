/**
 * Publish command handler -- Effect-based orchestration for `axm packs publish`.
 *
 * Publishes a pack from `.axm/extensions/` to a target registry:
 * 1. Resolve extension name (bare name -> profile from settings)
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
import { withAuthGuard } from "../../../auth/index.js";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "../../../workspace/index.js";
import { bridgeLegacyPlan, type LegacyPlannedStep } from "../../../workspace/plan-bridge.js";
import {
  formatFqn,
  parseFqn,
  parseFqnOrThrow,
  type Fqn,
  PACK_MANIFEST_FILENAME,
  RawPackManifestSchema,
  REGISTRY_EXTENSIONS_DIR,
} from "@axm.sh/core/unstable/extensions";
import {
  publishPack,
  type PublishPackOperation,
} from "../../../extensions/packs/operations/publish.js";
import {
  publishSkill,
  type PublishSkillOperation,
} from "../../../extensions/skills/operations/publish.js";
import {
  publishCommand,
  type PublishCommandOperation,
} from "../../../extensions/commands/operations/publish.js";
import {
  publishMcpServer,
  type PublishMcpServerOperation,
} from "../../../extensions/mcp-servers/operations/publish.js";
import { computePackPaths } from "../../../extensions/packs/paths.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs publish command.
 */
export interface PublishPackHandlerArgs {
  /** Pack name (@profile/name or bare name). */
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

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs publish` command.
 */
export const handlePublishPack = Effect.fn("PublishPack.handle")(function* (
  args: PublishPackHandlerArgs,
) {
  yield* withAuthGuard(publishPackEffect(args), { yes: args.yes });
});

const publishPackEffect = Effect.fn("PublishPack.publishEffect")(function* (
  args: PublishPackHandlerArgs,
) {
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const renderer = yield* CliRenderer;
  const base = ws.baseDir;

  yield* renderer.info("axm packs publish");

  // Step 1: Resolve pack name
  const hasProfile = args.pack.startsWith("@") && args.pack.includes("/");
  const packName = yield* hasProfile
    ? Effect.succeed(args.pack)
    : ws.getConfiguredProfile().pipe(
        Effect.map((profile) => formatFqn({ handle: profile, type: "packs", name: args.pack })),
        Effect.mapError((e) =>
          makeAppError({
            code: "NAMESPACE_RESOLUTION_FAILED",
            what: `Failed to resolve profile: ${e._tag}`,
            howToFix: "Configure a profile in your settings with `axm init`.",
            cause: e,
          }),
        ),
      );

  // Parse profile and pack name from the full name
  const fqn = yield* parseFqn(packName);

  // Step 2: Validate managed pack exists
  const manifestPath = yield* renderer.withSpinner(
    "Validating pack...",
    () =>
      Effect.gen(function* () {
        const packDir = computePackPaths(path.join, base, fqn.handle, fqn.name).canonicalPath;
        const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

        if (!packDirExists) {
          return yield* Effect.fail(
            makeAppError({
              code: "EXTENSION_NOT_FOUND",
              what: `Managed pack not found: ${packName}`,
              details: [`Expected at: ${packDir}`],
              howToFix:
                "Only managed packs (in .axm/extensions/) can be published. Use `axm packs new` first.",
            }),
          );
        }

        // Validate manifest exists
        const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
        const manifestExists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.orElseSucceed(() => false));

        if (!manifestExists) {
          return yield* Effect.fail(
            makeAppError({
              code: "MISSING_MANIFEST",
              what: `Missing manifest: ${PACK_MANIFEST_FILENAME}`,
              details: [`Expected at: ${manifestPath}`],
              howToFix: "Ensure the pack has a valid axm-pack.json manifest.",
            }),
          );
        }

        return manifestPath;
      }),
    { successMessage: `Validated ${packName}` },
  );

  // Step 3: Determine target registry
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

  const [defaultRegistry] = registrySources;
  const registryName = Option.match(args.registry, {
    onNone: () => defaultRegistry?.name ?? "default",
    onSome: (name) => name,
  });

  // Step 4: Discover local dependencies (when --include-dependencies)
  const dependencySteps: LegacyPlannedStep<PackPublishOp>[] = [];

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
            parsed.handle,
            parsed.type,
            parsed.name,
          );
          const exists = yield* fs.exists(depDir).pipe(Effect.orElseSucceed(() => false));

          if (exists) {
            const step = yield* makeDependencyStep(parsed, depFqn, registryName);
            dependencySteps.push(step);
          } else {
            yield* renderer.warn(`Skipping non-local dependency: ${depFqn}`);
          }
        }),
      { concurrency: "unbounded" },
    );
  }

  // Step 5: Build plan
  const packStep: LegacyPlannedStep<PackPublishOp> = {
    _tag: "PlannedJobStep",
    operation: {
      name: "publish-pack",
      args: {
        name: packName,
        registryName,
      },
    } satisfies PublishPackOperation,
    readiness: { status: "ready", message: Option.none() },
    label: `Publish ${packName}`,
  };

  const jobs: Array<{
    readonly steps: ReadonlyArray<LegacyPlannedStep<PackPublishOp>>;
    readonly concurrency: "unbounded" | 1;
  }> =
    dependencySteps.length > 0
      ? [
          { steps: dependencySteps, concurrency: "unbounded" as const },
          { steps: [packStep], concurrency: 1 as const },
        ]
      : [{ steps: [packStep], concurrency: 1 as const }];

  const plan = {
    name: "Publish pack",
    description: Option.some(`Publish ${packName} to registry "${registryName}"`),
    jobs,
  };

  yield* ws.resolvePlan(
    bridgeLegacyPlan(plan, {
      "publish-pack": publishPack,
      "publish-skill": publishSkill,
      "publish-command": publishCommand,
      "publish-mcp-server": publishMcpServer,
    }),
    { yes: args.yes, force: args.force, preview: args.preview },
  );

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
): Effect.Effect<LegacyPlannedStep<PackPublishOp>, AppError> => {
  const base = {
    _tag: "PlannedJobStep" as const,
    readiness: { status: "ready" as const, message: Option.none() },
    label: `Publish dependency ${depFqn}`,
  };

  switch (parsed.type) {
    case "skills":
      return Effect.succeed({
        ...base,
        operation: {
          name: "publish-skill",
          args: { name: depFqn, registryName },
        } satisfies PublishSkillOperation,
      });
    case "commands":
      return Effect.succeed({
        ...base,
        operation: {
          name: "publish-command",
          args: { name: depFqn, registryName },
        } satisfies PublishCommandOperation,
      });
    case "mcp-servers":
      return Effect.succeed({
        ...base,
        operation: {
          name: "publish-mcp-server",
          args: { name: depFqn, registryName },
        } satisfies PublishMcpServerOperation,
      });
    case "packs":
      return Effect.fail(
        makeAppError({
          code: "PACK_DEPENDENCY_UNSUPPORTED",
          what: `Pack dependencies of packs are not supported for publishing: ${depFqn}`,
        }),
      );
  }
};
