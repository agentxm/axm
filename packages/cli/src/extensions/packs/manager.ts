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
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { REGISTRY_EXTENSIONS_DIR } from "@axm.sh/core/unstable/extensions";
import type { PackExtensionRef, RegistryPackRef } from "@axm.sh/core/unstable/sources";
import { SourceHostProviders } from "../../sources/index.js";
import type {
  ExtensionManager,
  PackExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import { Workspace, type SetPackArgs } from "../../workspace/service.js";
import { copySkillDirectory } from "../skills/operations/copy-directory.js";
import { sanitizeName } from "../skills/utils.js";
import { computePackPaths } from "./paths.js";
import { removeIfExists } from "@axm.sh/core/unstable/utils";
import {
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "@axm.sh/core/unstable/lockfile";

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
): SetPackArgs => ({
  profile: ref.profile,
  name: ref.pack.name,
  resolvedVersion: ref.version,
  integrity: ref.integrity,
  sourceName: "default",
  installedAt: new Date(),
  updatedAt: new Date(),
  resolvedSkills: { ...ref.pack.skills },
  resolvedCommands: { ...ref.pack.commands },
  resolvedMcpServers: { ...ref.pack.mcpServers },
  versionConstraint,
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
              ref.profile,
              ref.pack.name,
            ).canonicalPath;
            yield* provide(
              copySkillDirectory(fetched.directory, packDir).pipe(
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
      yield* validateExactResolvedVersionMap(
        `packs.${ref.pack.name}.resolvedSkills`,
        ref.pack.skills,
      );
      yield* validateExactResolvedVersionMap(
        `packs.${ref.pack.name}.resolvedCommands`,
        ref.pack.commands,
      );
      yield* validateExactResolvedVersionMap(
        `packs.${ref.pack.name}.resolvedMcpServers`,
        ref.pack.mcpServers,
      );

      const packDir = computePackPaths(
        path.join,
        baseDir,
        registryRef.profile,
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
            copySkillDirectory(fetched.directory, packDir).pipe(
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
          target.profile,
          target.name,
        ).canonicalPath;
        yield* removeIfExists(fs, packDir);
      });

    return {
      extensionType: "pack",
      isInstalled: ({ target }: { readonly target: PackExtensionTarget }) =>
        Effect.gen(function* () {
          const installedPacks = yield* ws.getInstalledPacks();
          if (target.name in installedPacks) {
            return true;
          }

          return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
        }).pipe(Effect.withSpan("PackManager.isInstalled")),
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
        const args = buildSetPackArgs(ref, versionConstraint);
        return ws.setPack(args).pipe(Effect.withSpan("PackManager.upsertSettingsEntry"));
      },

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackSettings(target.name).pipe(Effect.withSpan("PackManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: PackExtensionRef }) => {
        if (ref.refType === "builtin")
          return Effect.void.pipe(Effect.withSpan("PackManager.upsertLockfileEntry"));
        const args = buildSetPackArgs(ref, Option.none());
        return ws.setPack(args).pipe(Effect.withSpan("PackManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackLock(target.name).pipe(Effect.withSpan("PackManager.removeLockfileEntry")),
    } satisfies ExtensionManager<PackExtensionRef>;
  }),
);
