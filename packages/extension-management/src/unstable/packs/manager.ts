/**
 * Pack manager service.
 *
 * Implements ExtensionManager<PackRef>. Delegates to existing
 * pack materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import {
  canReuseInstalledPackage,
  replaceCanonicalDirectoryWithInspection,
} from "../extensions/index.js";
import { configuredPacksToDiskRefs } from "../extensions/materializable-from-disk.js";
import type { PackRef, RegistryPackRef } from "./refs.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  PackExtensionTarget,
} from "../workspace/service-interface.js";
import { WorkspaceMutations, type SetPackArgs } from "../workspace/service-interface.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import { computePackPathsForLayout } from "./paths.js";
import { removeIfExists } from "../workspace/remove-if-exists.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../workspace/accepted-canonical-ref.js";
import { computePackManifestContentIdentity } from "./manifest-content-identity.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../extensions/materialized-tree.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class PackManager extends ServiceMap.Service<PackManager, ExtensionManager<PackRef>>()(
  "@agentxm/extension-management/unstable/packs/manager/PackManager",
) {}

// Build pack SetPackArgs from a registry ref
const buildSetPackArgs = (
  ref: RegistryPackRef,
  versionRange: Option.Option<string>,
  treeIntegrity: TreeIntegrity,
): SetPackArgs => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "pack",
  workspaceName: ref.pack.name,
  owner: ref.owner,
  name: ref.pack.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
  manifestContentIdentity: computePackManifestContentIdentity({
    owner: ref.owner,
    type: "pack",
    name: ref.pack.name,
    version: ref.version,
    dependencies: ref.pack.dependencies,
  }),
  versionRange,
});

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const PackManagerLive = Layer.effect(
  PackManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E, never> => Effect.provide(effect, fsPathLayer);
    const lastTreeIntegrities = new Map<string, TreeIntegrity>();
    const materializeInstall: ExtensionManager<PackRef>["materializeInstall"] = Effect.fn(
      "PackManager.materializeInstall",
    )(function* ({ ref, force }: { readonly ref: PackRef; readonly force?: boolean }) {
      if (ref.refType === "registry") {
        yield* validateExactResolvedVersion(`packs.${ref.pack.name}.resolvedVersion`, ref.version);
      }

      const packDir = computePackPathsForLayout(
        path.join,
        ws.layout,
        ref.refType === "workspace" ? "workspace" : ref.source.name,
        ref.owner,
        ref.pack.name,
      ).canonicalPath;
      const canonicalExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));
      if (ref.refType === "workspace") {
        if (ref.scope !== ws.scope || path.resolve(ref.location) !== path.resolve(packDir)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Invalid workspace pack source location: ${ref.location}`,
          });
        }
        if (!canonicalExists) {
          return yield* makeAppError({
            code: "validation",
            detail: `Workspace pack package is missing: ${packDir}`,
          });
        }
        return;
      }
      const lockedEntry = yield* ws.getLockedPack(ref.pack.name);
      const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
      if (
        yield* provide(
          canReuseInstalledPackage({
            installedPath: packDir,
            force: force === true,
            refVersion: ref.version,
            hasIntegrity: Option.isSome(ref.integrity),
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) =>
              `Failed to check if canonical pack path exists: ${target}`,
          }),
        )
      ) {
        if (Option.isSome(lockedEntry)) {
          const observedTree = yield* provide(computeMaterializedTreeIntegrity(packDir));
          if (observedTree === lockedEntry.value.treeIntegrity) {
            lastTreeIntegrities.set(ref.pack.name, lockedEntry.value.treeIntegrity);
            return;
          }
        }
      }

      yield* Effect.scoped(
        Effect.gen(function* () {
          const fetched = yield* sources.fetch(ref).pipe(
            Effect.mapError((e: Error) =>
              makeAppError({
                code: "network",
                detail: `Failed to fetch pack archive: ${e.message}`,
                cause: e,
              }),
            ),
          );
          const materialized = yield* provide(
            replaceCanonicalDirectoryWithInspection({
              baseDir,
              canonicalPath: packDir,
              populate: (stagingPath) =>
                copyExtensionDirectory(fetched.directory, stagingPath).pipe(
                  Effect.mapError((cause) =>
                    makeAppError({
                      code: "internal",
                      detail: `Failed to stage pack at ${packDir}`,
                      cause,
                    }),
                  ),
                ),
              inspect: computeMaterializedTreeIntegrity,
            }),
          );
          lastTreeIntegrities.set(ref.pack.name, materialized.inspection);
        }),
      );
    });
    const materializeUninstall: ExtensionManager<PackRef>["materializeUninstall"] = Effect.fn(
      "PackManager.materializeUninstall",
    )(function* ({ target }) {
      const canonical = yield* provide(
        acceptedCanonicalObservation({ workspace: ws, type: "pack", name: target.name }),
      );
      const packDir = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(packDir)) yield* removeIfExists(fs, packDir.value);
    });
    const materializeDeactivate: ExtensionManager<PackRef>["materializeDeactivate"] = () =>
      Effect.void;

    const buildCurrentPackArgs = (
      ref: PackRef,
      versionRange: Option.Option<string>,
    ): Effect.Effect<Option.Option<SetPackArgs>, ReturnType<typeof makeAppError>> =>
      Effect.gen(function* () {
        if (ref.refType !== "registry") return Option.none();
        const treeIntegrity = lastTreeIntegrities.get(ref.pack.name);
        if (treeIntegrity === undefined) {
          return yield* makeAppError({
            code: "internal",
            detail: `Pack ${ref.pack.name} has no materialized tree integrity`,
          });
        }
        return Option.some(buildSetPackArgs(ref, versionRange, treeIntegrity));
      });

    return {
      type: "pack",
      runTransaction: ws.runTransaction,
      isInstalled: Effect.fn("PackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(ws, "pack", target.name);
      }),
      materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            workspace: ws,
            type: "pack",
            name: ref.pack.name,
            ref,
          }),
        ),
      getConfiguredSource: Effect.fn("PackManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredPackEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("PackManager.listMaterializable")(function* () {
        const configured = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
        return yield* configuredPacksToDiskRefs(
          { fs, path, baseDir, scope: ws.scope, layout: ws.layout },
          configured,
        );
      }),
      materializeUninstall,
      materializeDeactivate,

      upsertSettingsEntry: Effect.fn("PackManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }: {
        readonly ref: PackRef;
        readonly versionRange: Option.Option<string>;
      }) {
        const args = yield* buildCurrentPackArgs(ref, versionRange);
        if (Option.isSome(args)) {
          yield* ws.setPack(args.value);
        } else {
          yield* ws.setPackEntry(ref.pack.name, {
            source: "workspace",
            enabled: true,
          });
        }
      }),

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackSettings(target.name).pipe(Effect.withSpan("PackManager.removeSettingsEntry")),

      upsertLockfileEntry: Effect.fn("PackManager.upsertLockfileEntry")(function* ({ ref }) {
        const args = yield* buildCurrentPackArgs(ref, Option.none());
        if (Option.isSome(args)) {
          yield* ws.setPackLock(args.value);
        } else {
          yield* ws.removePackLock(ref.pack.name);
        }
      }),

      removeLockfileEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackLock(target.name).pipe(Effect.withSpan("PackManager.removeLockfileEntry")),
    } satisfies ExtensionManager<PackRef>;
  }),
);
