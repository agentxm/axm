/**
 * Extension pack manager service.
 *
 * Implements ExtensionManager<ExtensionPackRef>. Delegates to existing
 * extension pack materialization functions and workspace service methods.
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
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { configuredPacksToDiskRefs } from "../extensions/materializable-from-disk.js";
import type { ExtensionPackRef, RegistryExtensionPackRef } from "./refs.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../source-resolution/index.js";
import type { ExtensionManager, PackExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations, type SetExtensionPackArgs } from "../workspace/service-interface.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import { sanitizeName } from "../extensions/utils.js";
import { computeExtensionPackPaths } from "./paths.js";
import { removeIfExists } from "../utils/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import type { AppError } from "../app-error/index.js";
import { resolveExtensionPackDependencies } from "./dependency-resolution.js";
import { decodeExactSemverVersionSync } from "../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class ExtensionPackManager extends ServiceMap.Service<
  ExtensionPackManager,
  ExtensionManager<ExtensionPackRef>
>()("axm.sh/ExtensionPackManager") {}

// Build pack SetExtensionPackArgs from a registry ref
const buildSetExtensionPackArgs = (
  ref: RegistryExtensionPackRef,
  versionConstraint: Option.Option<string>,
  sources: SourceHostProvidersService,
): Effect.Effect<SetExtensionPackArgs, AppError> =>
  Effect.gen(function* () {
    const resolved = yield* resolveExtensionPackDependencies(ref, sources);

    return {
      owner: ref.owner,
      name: ref.pack.name,
      resolvedVersion: decodeExactSemverVersionSync(ref.version),
      integrity: Option.getOrElse(ref.integrity, () => ""),
      sourceName: "default",
      installedAt: new Date(),
      updatedAt: new Date(),
      resolvedSkills: resolved.resolvedSkills,
      resolvedCommands: resolved.resolvedCommands,
      resolvedMcpServers: resolved.resolvedMcpServers,
      resolvedSubagents: resolved.resolvedSubagents,
      versionConstraint,
    } satisfies SetExtensionPackArgs;
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

export const ExtensionPackManagerLive = Layer.effect(
  ExtensionPackManager,
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
    const materializeInstall: ExtensionManager<ExtensionPackRef>["materializeInstall"] = Effect.fn(
      "ExtensionPackManager.materializeInstall",
    )(function* ({ ref }: { readonly ref: ExtensionPackRef }) {
      yield* validateExactResolvedVersion(`packs.${ref.pack.name}.resolvedVersion`, ref.version);

      const packDir = computeExtensionPackPaths(
        path.join,
        baseDir,
        ref.owner,
        ref.pack.name,
      ).canonicalPath;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const fetched = yield* sources.fetch(ref).pipe(
            Effect.mapError((e: Error) =>
              makeAppError({
                code: "PACK_FETCH_FAILED",
                category: "internal",
                what: `Failed to fetch extension pack archive: ${e.message}`,
                cause: e,
              }),
            ),
          );
          yield* provide(
            copyExtensionDirectory(fetched.directory, packDir).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "PACK_EXTRACT_FAILED",
                  category: "internal",
                  what: `Failed to extract extension pack to ${packDir}`,
                  cause: e,
                }),
              ),
            ),
          );
        }),
      );
    });
    const materializeUninstall: ExtensionManager<ExtensionPackRef>["materializeUninstall"] =
      Effect.fn("ExtensionPackManager.materializeUninstall")(function* ({
        target,
      }: {
        readonly target: PackExtensionTarget;
      }) {
        const packDir = computeExtensionPackPaths(
          path.join,
          baseDir,
          target.owner,
          target.name,
        ).canonicalPath;
        yield* removeIfExists(fs, packDir);
      });

    return {
      type: "pack",
      isInstalled: Effect.fn("ExtensionPackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: PackExtensionTarget;
      }) {
        const installedPacks = yield* ws.records.getInstalledPacks();
        if (target.name in installedPacks) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),
      materializeInstall,
      listMaterializable: Effect.fn("ExtensionPackManager.listMaterializable")(function* () {
        const configured = yield* ws.records.getConfiguredPacks();
        return yield* configuredPacksToDiskRefs({ fs, path, baseDir }, configured);
      }),
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
        versionConstraint,
      }: {
        readonly ref: ExtensionPackRef;
        readonly versionConstraint: Option.Option<string>;
      }) =>
        buildSetExtensionPackArgs(ref, versionConstraint, sources).pipe(
          Effect.flatMap((args) => ws.setExtensionPack(args)),
          Effect.withSpan("ExtensionPackManager.upsertSettingsEntry"),
        ),

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws
          .removeExtensionPackSettings(target.name)
          .pipe(Effect.withSpan("ExtensionPackManager.removeSettingsEntry")),

      // Pack lockfile entries are written by upsertSettingsEntry via buildSetExtensionPackArgs;
      // this method satisfies the ExtensionManager interface but performs no additional work.
      upsertLockfileEntry: ({ ref }: { readonly ref: ExtensionPackRef }) => {
        void ref;
        return Effect.void.pipe(Effect.withSpan("ExtensionPackManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws
          .removeExtensionPackLock(target.name)
          .pipe(Effect.withSpan("ExtensionPackManager.removeLockfileEntry")),
    } satisfies ExtensionManager<ExtensionPackRef>;
  }),
);
