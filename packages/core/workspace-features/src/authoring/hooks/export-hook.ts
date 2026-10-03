/** Create-only native bundles use the normal staged workspace transaction. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { readExtensionManifest } from "@agentxm/extension-content";
import {
  canonicalMaterializationPaths,
  createCanonicalDirectory,
} from "@agentxm/workspace-kernel/acquisition";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import {
  WorkspaceLocation,
  computePackageContentHash,
  validatePathSafety,
} from "@agentxm/workspace-kernel/workspace-state";
import type { PlanExecution } from "@agentxm/workspace-kernel/operations";
import { AuthoringFailed } from "../errors.js";
import { authoringFailureToStepFailure } from "../step-failure.js";
import {
  NATIVE_HOOK_BUNDLE_CONFIG,
  NATIVE_HOOK_BUNDLE_METADATA,
  nativeHookExportDocument,
  nativeHookBundleMetadata,
  readHookResources,
} from "./interchange.js";

const failed = (detail: string, cause?: unknown) =>
  new AuthoringFailed({
    category: "validation",
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

export const prepareExportHook = Effect.fn("Hook.prepareExport")(function* (request: {
  readonly directory: string;
  readonly implementation: string;
  readonly destination: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const location = yield* WorkspaceLocation;
  const source = yield* fs.realPath(path.resolve(location.baseDir, request.directory));
  const destination = path.resolve(location.baseDir, request.destination);
  yield* validatePathSafety(path, location.baseDir, destination);
  const sourceRelative = path.relative(source, destination);
  if (
    destination === location.baseDir ||
    sourceRelative === "" ||
    (!sourceRelative.startsWith(`..${path.sep}`) &&
      sourceRelative !== ".." &&
      !path.isAbsolute(sourceRelative))
  )
    return yield* failed(
      "Native export requires a new workspace directory outside the source package.",
    );
  const siblings = canonicalMaterializationPaths(destination);
  const checkDestination = Effect.gen(function* () {
    const parent = path.dirname(destination);
    if ((yield* fs.realPath(parent)) !== parent)
      return yield* failed(
        "Native export requires an existing destination parent without symbolic directory aliases.",
      );
    for (const candidate of [destination, siblings.stagingPath, siblings.backupPath]) {
      const link = yield* fs.readLink(candidate).pipe(Effect.option);
      if (Option.isSome(link) || (yield* fs.exists(candidate)))
        return yield* failed("Native export refuses an existing destination or staging path.");
    }
  });
  yield* checkDestination;
  const contentHash = yield* computePackageContentHash(source);
  const { manifest } = yield* readExtensionManifest(source, "hook");
  if (manifest.type !== "hook") return yield* failed("Native export requires a Hook package.");
  const implementation = manifest.implementations.find(
    (item) => item.id === request.implementation,
  );
  if (implementation === undefined)
    return yield* failed("The requested native implementation is not declared by this package.");
  const document = yield* nativeHookExportDocument(manifest, implementation);
  const files = yield* readHookResources(source, [
    ...(manifest.assets ?? []),
    ...implementation.bindings.map((binding) => binding.handler.entrypoint),
  ]);
  if ((yield* computePackageContentHash(source)) !== contentHash)
    return yield* failed("Hook content changed while export was prepared; prepare export again.");
  const encoder = new TextEncoder();
  const bundle = [
    ...files,
    {
      path: NATIVE_HOOK_BUNDLE_CONFIG,
      bytes: encoder.encode(`${JSON.stringify(document, null, 2)}\n`),
    },
    {
      path: NATIVE_HOOK_BUNDLE_METADATA,
      bytes: encoder.encode(
        `${JSON.stringify(
          nativeHookBundleMetadata(
            manifest,
            implementation,
            files.map((file) => file.path),
          ),
          null,
          2,
        )}\n`,
      ),
    },
  ];
  const artifact = {
    path: path.relative(location.baseDir, destination),
    scope: location.scope,
    change: "created" as const,
    fileCount: bundle.length,
    targets: bundle.map((file) => ({
      path: path.relative(location.baseDir, path.join(destination, file.path)),
      change: "created" as const,
    })),
  };
  const run = runWorkspaceTransaction({
    transition: Effect.gen(function* () {
      yield* checkDestination;
      if ((yield* computePackageContentHash(source)) !== contentHash)
        return yield* failed("Hook content changed after export preview; prepare export again.");
      yield* createCanonicalDirectory({
        baseDir: location.baseDir,
        canonicalPath: destination,
        subject: "Native Hook export",
        requiredFiles: bundle.map((file) => file.path),
        populate: (staging) =>
          Effect.gen(function* () {
            for (const file of bundle) {
              const target = path.join(staging, file.path);
              yield* fs.makeDirectory(path.dirname(target), { recursive: true });
              yield* fs.writeFile(target, file.bytes);
            }
          }),
      });
    }),
    validate: () => Effect.void,
  }).pipe(
    Effect.mapError((cause) =>
      authoringFailureToStepFailure(failed("Native Hook export could not settle", cause)),
    ),
    Effect.as({
      result: "success" as const,
      message:
        "Exported native Hook bundle; commands require the bundle root as their working directory",
      artifact,
    }),
  );
  return yield* prepareExecutionCandidate({
    _tag: "Plan",
    name: "Export hook",
    description: Option.some(
      "Create a self-contained native command bundle without activating or executing it",
    ),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            key: "hook:export",
            label: `${manifest.name}:${implementation.id}`,
            readiness: "ready",
            artifact,
            materialPaths: [destination],
            run,
          },
        ],
      },
    ],
  });
});

export const ExportHook = {
  prepare: prepareExportHook,
  previewOrApply: (
    candidate: Effect.Success<ReturnType<typeof prepareExportHook>>,
    execution: PlanExecution,
  ) => resolveExecutionCandidate(candidate, execution),
};
