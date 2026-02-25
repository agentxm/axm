/**
 * Publish command handler -- Effect-based orchestration for `axm packs publish`.
 *
 * Publishes a pack from `.axm/extensions/` to a target registry:
 * 1. Registry guard (ensure registry configured)
 * 2. Resolve extension name (bare name -> namespace from settings)
 * 3. Validate managed pack exists with manifest
 * 4. Discover local dependencies (when --include-dependencies)
 * 5. Build plan (dependency job + pack job, or pack-only)
 * 6. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { registryGuard } from "../../../sources/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeCliError, type CliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { Job, PlannedJobStep } from "../../../workspace/plan.js";
import { formatFqn, parseFqn, parseFqnOrThrow, type Fqn } from "../../../extensions/index.js";
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
import {
  PACK_MANIFEST_FILENAME,
  RawPackManifestSchema,
} from "../../../extensions/packs/manifest-schema.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs publish command.
 */
export interface PublishPackHandlerArgs {
  /** Pack name (@namespace/name or bare name). */
  readonly pack: string;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Skip confirmations. */
  readonly yes: boolean;
  /** Publish locally managed dependency extensions alongside the pack. */
  readonly includeDependencies: boolean;
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
  const ws = yield* Workspace;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;
  const base = ws.baseDir;

  yield* log.info("axm packs publish");

  // Step 1: Registry guard
  yield* registryGuard;

  // Step 2: Resolve pack name
  const hasNamespace = args.pack.startsWith("@") && args.pack.includes("/");
  const packName = yield* hasNamespace
    ? Effect.succeed(args.pack)
    : ws.getConfiguredNamespace().pipe(
        Effect.map((namespace) => formatFqn({ namespace, type: "packs", name: args.pack })),
        Effect.mapError((e) =>
          makeCliError({
            code: "NAMESPACE_RESOLUTION_FAILED",
            what: `Failed to resolve namespace: ${e._tag}`,
            howToFix: "Configure a namespace in your settings with `axm init`.",
            cause: e,
          }),
        ),
      );

  // Parse namespace and pack name from the full name
  const fqn = yield* parseFqn(packName);

  // Step 3: Validate managed pack exists
  const handle = yield* spinnerSvc.start("Validating pack...");
  const packDir = computePackPaths(path.join, base, fqn.namespace, fqn.name).canonicalPath;
  const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));

  if (!packDirExists) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
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
  const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));

  if (!manifestExists) {
    yield* handle.stop("Failed");
    return yield* Effect.fail(
      makeCliError({
        code: "MISSING_MANIFEST",
        what: `Missing manifest: ${PACK_MANIFEST_FILENAME}`,
        details: [`Expected at: ${manifestPath}`],
        howToFix: "Ensure the pack has a valid axm-pack.json manifest.",
      }),
    );
  }

  yield* handle.stop(`Validated ${packName}`);

  // Step 4: Determine target registry
  const registrySources = yield* ws.getConfiguredRegistrySources().pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "REGISTRY_SOURCES_FAILED",
        what: `Failed to get registry sources: ${e._tag}`,
        cause: e,
      }),
    ),
  );

  if (registrySources.length === 0) {
    return yield* Effect.fail(
      makeCliError({
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

  // Step 5: Discover local dependencies (when --include-dependencies)
  const dependencySteps: PlannedJobStep<PackPublishOp>[] = [];

  if (args.includeDependencies) {
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PACK_MANIFEST_READ_FAILED",
          what: `Failed to read pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const json = yield* Effect.try({
      try: () => JSON.parse(manifestContent) as unknown,
      catch: (e) =>
        makeCliError({
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknown(RawPackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeCliError({
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
            parsed.namespace,
            parsed.type,
            parsed.name,
          );
          const exists = yield* fs.exists(depDir).pipe(Effect.orElseSucceed(() => false));

          if (exists) {
            const step = yield* makeDependencyStep(parsed, depFqn, registryName);
            dependencySteps.push(step);
          } else {
            yield* log.warn(`Skipping non-local dependency: ${depFqn}`);
          }
        }),
      { concurrency: "unbounded" },
    );
  }

  // Step 6: Build plan
  const packStep: PlannedJobStep<PackPublishOp> = {
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

  const jobs: Job<PackPublishOp>[] =
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

  yield* ws.resolvePlan(plan, {
    "publish-pack": publishPack,
    "publish-skill": publishSkill,
    "publish-command": publishCommand,
    "publish-mcp-server": publishMcpServer,
  });

  yield* log.success("Done");
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create a per-type publish dependency step from a parsed FQN. */
const makeDependencyStep = (
  parsed: Fqn,
  depFqn: string,
  registryName: string,
): Effect.Effect<PlannedJobStep<PackPublishOp>, CliError> => {
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
        makeCliError({
          code: "PACK_DEPENDENCY_UNSUPPORTED",
          what: `Pack dependencies of packs are not supported for publishing: ${depFqn}`,
        }),
      );
  }
};
