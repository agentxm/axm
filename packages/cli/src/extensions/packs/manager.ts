/**
 * Pack extension manager service.
 *
 * Implements ExtensionManager<PackExtensionRef>. Delegates to existing
 * pack materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeCliError } from "../../cli-error/index.js";
import type { PackExtensionRef, RegistryPackRef } from "../../sources/types.js";
import { SourceHostProviders } from "../../sources/index.js";
import type {
  ExtensionManager,
  PackExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import { Workspace, type SetPackArgs } from "../../workspace/service.js";
import { copySkillDirectory } from "../skills/operations/copy-directory.js";
import { computePackPaths } from "./paths.js";
import { removeIfExists } from "../../utils/fs-helpers.js";
import {
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "../../lockfile/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class PackManager extends Context.Tag("@axm.sh/cli/PackManager")<
  PackManager,
  ExtensionManager<PackExtensionRef>
>() {}

// Build pack SetPackArgs from a registry ref
const buildSetPackArgs = (
  ref: RegistryPackRef,
  versionConstraint: Option.Option<string>,
): SetPackArgs => ({
  namespace: ref.namespace,
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

    return {
      extensionType: "pack",

      materializeInstall: ({ ref }: { readonly ref: PackExtensionRef }) =>
        Effect.gen(function* () {
          if (ref.refType === "builtin") {
            // Builtin packs — fetch via source host providers
            yield* Effect.scoped(
              Effect.gen(function* () {
                const fetched = yield* sources.fetch(ref).pipe(
                  Effect.mapError((e: Error) =>
                    makeCliError({
                      code: "PACK_FETCH_FAILED",
                      what: `Failed to fetch builtin pack: ${e.message}`,
                      cause: e,
                    }),
                  ),
                );
                const packDir = computePackPaths(
                  path.join,
                  baseDir,
                  ref.namespace,
                  ref.pack.name,
                ).canonicalPath;
                yield* provide(
                  copySkillDirectory(fetched.directory, packDir).pipe(
                    Effect.mapError((e) =>
                      makeCliError({
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

          // Registry pack
          const registryRef = ref as RegistryPackRef;

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
            registryRef.namespace,
            ref.pack.name,
          ).canonicalPath;

          yield* Effect.scoped(
            Effect.gen(function* () {
              const fetched = yield* sources.fetch(ref).pipe(
                Effect.mapError((e: Error) =>
                  makeCliError({
                    code: "PACK_FETCH_FAILED",
                    what: `Failed to fetch pack archive: ${e.message}`,
                    cause: e,
                  }),
                ),
              );
              yield* provide(
                copySkillDirectory(fetched.directory, packDir).pipe(
                  Effect.mapError((e) =>
                    makeCliError({
                      code: "PACK_EXTRACT_FAILED",
                      what: `Failed to extract pack to ${packDir}`,
                      cause: e,
                    }),
                  ),
                ),
              );
            }),
          );
        }).pipe(Effect.withSpan("PackManager.materializeInstall")),

      materializeUninstall: ({ target }: { readonly target: PackExtensionTarget }) =>
        Effect.gen(function* () {
          const packDir = computePackPaths(
            path.join,
            baseDir,
            target.namespace,
            target.name,
          ).canonicalPath;
          yield* removeIfExists(fs, packDir);
        }).pipe(Effect.withSpan("PackManager.materializeUninstall")),

      upsertSettingsEntry: ({
        ref,
        versionConstraint,
      }: {
        readonly ref: PackExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        if (ref.refType === "builtin") return Effect.void.pipe(Effect.withSpan("PackManager.upsertSettingsEntry"));
        const args = buildSetPackArgs(ref as RegistryPackRef, versionConstraint);
        return ws.setPack(args).pipe(Effect.withSpan("PackManager.upsertSettingsEntry"));
      },

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackSettings(target.name).pipe(
          Effect.withSpan("PackManager.removeSettingsEntry"),
        ),

      upsertLockfileEntry: ({ ref }: { readonly ref: PackExtensionRef }) => {
        if (ref.refType === "builtin") return Effect.void.pipe(Effect.withSpan("PackManager.upsertLockfileEntry"));
        const args = buildSetPackArgs(ref as RegistryPackRef, Option.none());
        return ws.setPack(args).pipe(Effect.withSpan("PackManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackLock(target.name).pipe(
          Effect.withSpan("PackManager.removeLockfileEntry"),
        ),
    } satisfies ExtensionManager<PackExtensionRef>;
  }),
);
