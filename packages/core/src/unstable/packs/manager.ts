/**
 * Pack extension manager service.
 *
 * Implements ExtensionManager<PackExtensionRef>. Delegates to existing
 * pack materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import type { PackExtensionRef, RegistryPackRef } from "./refs.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../source-resolution/index.js";
import type { ExtensionManager, PackExtensionTarget } from "../workspace/service-interface.js";
import { Workspace, type SetPackArgs } from "../workspace/service-interface.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import { sanitizeName } from "../extensions/utils.js";
import { computePackPaths } from "./paths.js";
import { removeIfExists } from "../utils/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import type { AppError } from "../app-error/index.js";
import { resolvePackDependencies } from "./dependency-resolution.js";
import { decodeExactSemverVersionSync } from "../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class PackManager extends ServiceMap.Service<
  PackManager,
  ExtensionManager<PackExtensionRef>
>()("@axm.sh/cli/PackManager") {}

// Build pack SetPackArgs from a registry ref
const buildSetPackArgs = (
  ref: RegistryPackRef,
  versionConstraint: Option.Option<string>,
  sources: SourceHostProvidersService,
): Effect.Effect<SetPackArgs, AppError> =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependencies(ref, sources);

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
      versionConstraint,
    } satisfies SetPackArgs;
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
    const ws = yield* Workspace;
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
    const materializeInstall: ExtensionManager<PackExtensionRef>["materializeInstall"] = Effect.fn(
      "PackManager.materializeInstall",
    )(function* ({ ref }: { readonly ref: PackExtensionRef }) {
      if (ref.refType === "builtin") {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const fetched = yield* sources.fetch(ref).pipe(
              Effect.mapError((e: Error) =>
                makeAppError({
                  code: "PACK_FETCH_FAILED",
                  what: `Failed to fetch builtin pack: ${e.message}`,
                  cause: e,
                }),
              ),
            );
            const packDir = computePackPaths(
              path.join,
              baseDir,
              ref.owner,
              ref.pack.name,
            ).canonicalPath;
            yield* provide(
              copyExtensionDirectory(fetched.directory, packDir).pipe(
                Effect.mapError((e) =>
                  makeAppError({
                    code: "PACK_EXTRACT_FAILED",
                    what: `Failed to extract pack to ${packDir}`,
                    cause: e,
                  }),
                ),
              ),
            );
          }),
        );
        return;
      }

      const registryRef = ref;

      yield* validateExactResolvedVersion(
        `packs.${ref.pack.name}.resolvedVersion`,
        registryRef.version,
      );

      const packDir = computePackPaths(
        path.join,
        baseDir,
        registryRef.owner,
        ref.pack.name,
      ).canonicalPath;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const fetched = yield* sources.fetch(ref).pipe(
            Effect.mapError((e: Error) =>
              makeAppError({
                code: "PACK_FETCH_FAILED",
                what: `Failed to fetch pack archive: ${e.message}`,
                cause: e,
              }),
            ),
          );
          yield* provide(
            copyExtensionDirectory(fetched.directory, packDir).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "PACK_EXTRACT_FAILED",
                  what: `Failed to extract pack to ${packDir}`,
                  cause: e,
                }),
              ),
            ),
          );
        }),
      );
    });
    const materializeUninstall: ExtensionManager<PackExtensionRef>["materializeUninstall"] =
      Effect.fn("PackManager.materializeUninstall")(function* ({
        target,
      }: {
        readonly target: PackExtensionTarget;
      }) {
        const packDir = computePackPaths(
          path.join,
          baseDir,
          target.owner,
          target.name,
        ).canonicalPath;
        yield* removeIfExists(fs, packDir);
      });

    return {
      type: "pack",
      isInstalled: Effect.fn("PackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: PackExtensionTarget;
      }) {
        const installedPacks = yield* ws.getInstalledPacks();
        if (target.name in installedPacks) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),
      materializeInstall,
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
        versionConstraint,
      }: {
        readonly ref: PackExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        if (ref.refType === "builtin")
          return Effect.void.pipe(Effect.withSpan("PackManager.upsertSettingsEntry"));
        return buildSetPackArgs(ref, versionConstraint, sources).pipe(
          Effect.flatMap((args) => ws.setPack(args)),
          Effect.withSpan("PackManager.upsertSettingsEntry"),
        );
      },

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackSettings(target.name).pipe(Effect.withSpan("PackManager.removeSettingsEntry")),

      // Pack lockfile entries are written by upsertSettingsEntry via buildSetPackArgs;
      // this method satisfies the ExtensionManager interface but performs no additional work.
      upsertLockfileEntry: ({ ref }: { readonly ref: PackExtensionRef }) => {
        void ref;
        return Effect.void.pipe(Effect.withSpan("PackManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackLock(target.name).pipe(Effect.withSpan("PackManager.removeLockfileEntry")),
    } satisfies ExtensionManager<PackExtensionRef>;
  }),
);
