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
import { REGISTRY_EXTENSIONS_DIR, shouldReuseCanonicalInstall } from "../extensions/index.js";
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
import { sanitizeName } from "../extensions/utils.js";
import { computePackPaths } from "./paths.js";
import { removeIfExists } from "../utils/index.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { printSourceParams } from "../sources/index.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { computePackManifestContentIdentity } from "./manifest-content-identity.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class PackManager extends ServiceMap.Service<PackManager, ExtensionManager<PackRef>>()(
  "@agentxm/client-core/unstable/packs/manager/PackManager",
) {}

// Build pack SetPackArgs from a registry ref
const buildSetPackArgs = (
  ref: RegistryPackRef,
  versionRange: Option.Option<string>,
): SetPackArgs => ({
  type: "registry",
  owner: ref.owner,
  name: ref.pack.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
  manifestContentIdentity: computePackManifestContentIdentity({
    owner: ref.owner,
    type: "pack",
    name: ref.pack.name,
    version: ref.version,
    dependencies: ref.pack.dependencies,
  }),
  versionRange,
});

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  packName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!extensionsDirExists) return false;

    const candidateNames = [packName];
    const sanitizedName = sanitizeName(packName);
    if (sanitizedName !== packName) {
      candidateNames.push(sanitizedName);
    }

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        return Effect.forEach(
          candidateNames,
          (candidateName) => {
            const packPath = pathService.join(extensionsDir, scopeDir, "packs", candidateName);
            return fsService.exists(packPath).pipe(Effect.catch(() => Effect.succeed(false)));
          },
          { concurrency: "unbounded" },
        ).pipe(Effect.map((candidates) => candidates.some((exists) => exists)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
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
    const materializeInstall: ExtensionManager<PackRef>["materializeInstall"] = Effect.fn(
      "PackManager.materializeInstall",
    )(function* ({ ref, force }: { readonly ref: PackRef; readonly force?: boolean }) {
      if (ref.refType === "registry") {
        yield* validateExactResolvedVersion(`packs.${ref.pack.name}.resolvedVersion`, ref.version);
      }

      const packDir = computePackPaths(path.join, baseDir, ref.owner, ref.pack.name).canonicalPath;
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
      const lockedVersion = acceptedRegistryVersionForRef(
        yield* ws.getLockedPack(ref.pack.name),
        ref,
      );
      if (
        shouldReuseCanonicalInstall({
          canonicalExists,
          force: force === true,
          hasIntegrity: Option.isSome(ref.integrity),
          refVersion: ref.refType === "registry" ? ref.version : undefined,
          lockedVersion,
        })
      ) {
        return;
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
          yield* protectWorkspacePath(packDir);
          yield* provide(
            copyExtensionDirectory(fetched.directory, packDir).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to extract pack to ${packDir}`,
                  cause: e,
                }),
              ),
            ),
          );
        }),
      );
    });
    const materializeUninstall: ExtensionManager<PackRef>["materializeUninstall"] = Effect.fn(
      "PackManager.materializeUninstall",
    )(function* ({ target }) {
      const packDir = computePackPaths(path.join, baseDir, target.owner, target.name).canonicalPath;
      yield* removeIfExists(fs, packDir);
    });
    const materializeDeactivate: ExtensionManager<PackRef>["materializeDeactivate"] = () =>
      Effect.void;

    const buildCurrentPackArgs = (
      ref: PackRef,
      versionRange: Option.Option<string>,
    ): Option.Option<SetPackArgs> =>
      ref.refType === "registry" ? Option.some(buildSetPackArgs(ref, versionRange)) : Option.none();

    return {
      type: "pack",
      runTransaction: ws.runTransaction,
      isInstalled: Effect.fn("PackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        if (yield* isObservedInstalled(ws, "pack", target.name)) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),
      materializeInstall,
      getConfiguredSource: Effect.fn("PackManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredPackEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("PackManager.listMaterializable")(function* () {
        const configured = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
        return yield* configuredPacksToDiskRefs({ fs, path, baseDir, scope: ws.scope }, configured);
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
        const args = buildCurrentPackArgs(ref, versionRange);
        if (Option.isSome(args)) {
          yield* ws.setPack(args.value);
        } else {
          yield* ws.setPackEntry(ref.pack.name, {
            source: printSourceParams(ref.source),
            enabled: true,
          });
        }
      }),

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackSettings(target.name).pipe(Effect.withSpan("PackManager.removeSettingsEntry")),

      upsertLockfileEntry: Effect.fn("PackManager.upsertLockfileEntry")(function* ({ ref }) {
        const args = buildCurrentPackArgs(ref, Option.none());
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
