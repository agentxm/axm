/**
 * Command extension manager service.
 *
 * Implements ExtensionManager<CommandExtensionRef>. Delegates to existing
 * command materialization functions and workspace service methods.
 *
 * TODO: (#53) commands/ and mcp-servers/ modules are near line-for-line identical
 * (~10 source files + tests each). Consider extracting a generic registry-only
 * extension handler parameterized by extension type to reduce duplication.
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
import { isPathSafe } from "../../utils/path-safety.js";
import type { CommandExtensionRef, RegistryCommandRef } from "../../sources/types.js";
import type { CommandLockEntry } from "../../lockfile/schema.js";
import type {
  ExtensionManager,
  CommandExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import { Workspace } from "../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import { computeIntegrity } from "../../utils/integrity.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class CommandManager extends Context.Tag("@axm.sh/cli/CommandManager")<
  CommandManager,
  ExtensionManager<CommandExtensionRef>
>() {}

// Build lock entry from registry ref
const buildCommandLockEntry = (ref: RegistryCommandRef, now: Date): CommandLockEntry => ({
  type: "registry",
  namespace: ref.namespace,
  name: ref.name,
  resolvedVersion: ref.version,
  integrity: ref.integrity,
  sourceName: "default",
  installedAt: now,
  updatedAt: now,
});

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const CommandManagerLive = Layer.effect(
  CommandManager,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
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
      extensionType: "command",

      materializeInstall: ({ ref }: { readonly ref: CommandExtensionRef }) =>
        Effect.gen(function* () {
          if (ref.refType !== "registry") {
            return yield* makeCliError({
              code: "INSTALL_COMMAND_UNSUPPORTED_REF_TYPE",
              what: `Unsupported ref type for command install: ${ref.refType}`,
            });
          }

          const registryRef = ref as RegistryCommandRef;
          const canonicalPath = path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            registryRef.namespace,
            "commands",
            registryRef.name,
          );

          if (!isPathSafe(baseDir, canonicalPath)) {
            return yield* makeCliError({
              code: "INSTALL_COMMAND_PATH_TRAVERSAL",
              what: `Path traversal detected: ${canonicalPath}`,
            });
          }

          const canonicalExists = yield* fs.exists(canonicalPath).pipe(
            Effect.mapError((e) =>
              makeCliError({
                code: "INSTALL_COMMAND_PATH_CHECK_FAILED",
                what: `Failed to check if canonical path exists: ${canonicalPath}`,
                cause: e,
              }),
            ),
          );
          const useExisting = registryRef.integrity === "" && canonicalExists;

          if (!useExisting) {
            const locationStr =
              registryRef.source.location.protocol === "file:"
                ? registryRef.source.location.pathname
                : registryRef.source.location.href;
            const client = yield* provide(createRegistryClient(locationStr));
            const { archive } = yield* client.getExtensionPackage({
              namespace: registryRef.namespace,
              type: "command",
              name: registryRef.name,
              version: Option.some(registryRef.version),
            });

            if (registryRef.integrity !== "") {
              const actualIntegrity = yield* computeIntegrity(archive);
              if (actualIntegrity !== registryRef.integrity) {
                return yield* makeCliError({
                  code: "INSTALL_COMMAND_INTEGRITY_MISMATCH",
                  what: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
                  details: [`Expected ${registryRef.integrity}, got ${actualIntegrity}`],
                });
              }
            }

            const tmpDir = yield* fs.makeTempDirectory().pipe(
              Effect.mapError((e) =>
                makeCliError({
                  code: "INSTALL_COMMAND_TEMP_DIR_FAILED",
                  what: `Failed to create temporary directory for registry install`,
                  cause: e,
                }),
              ),
            );
            yield* Effect.ensuring(
              Effect.gen(function* () {
                yield* provide(extractZip(archive, tmpDir));
                yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
                yield* fs.makeDirectory(canonicalPath, { recursive: true }).pipe(
                  Effect.mapError((e) =>
                    makeCliError({
                      code: "INSTALL_COMMAND_COPY_FAILED",
                      what: `Failed to create canonical directory: ${canonicalPath}`,
                      cause: e,
                    }),
                  ),
                );
                const entries = yield* fs.readDirectory(tmpDir).pipe(
                  Effect.mapError((e) =>
                    makeCliError({
                      code: "INSTALL_COMMAND_COPY_FAILED",
                      what: `Failed to read extracted directory`,
                      cause: e,
                    }),
                  ),
                );
                yield* Effect.forEach(
                  entries,
                  (entry) => {
                    const src = path.join(tmpDir, entry);
                    const dest = path.join(canonicalPath, entry);
                    return fs.copy(src, dest).pipe(Effect.ignoreLogged);
                  },
                  { concurrency: "unbounded" },
                );
              }),
              fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
            );
          }
        }).pipe(Effect.withSpan("CommandManager.materializeInstall")),

      materializeUninstall: ({ target }: { readonly target: CommandExtensionTarget }) =>
        Effect.gen(function* () {
          const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
          const extensionsDirExists = yield* fs
            .exists(extensionsDir)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));

          if (!extensionsDirExists) return;

          const scopeDirs = yield* fs
            .readDirectory(extensionsDir)
            .pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<string>>([])));

          yield* Effect.forEach(
            scopeDirs,
            (scopeDir) => {
              if (!scopeDir.startsWith("@")) return Effect.void;
              const cmdPath = path.join(extensionsDir, scopeDir, "commands", target.name);
              return fs
                .remove(cmdPath, { recursive: true })
                .pipe(Effect.catchAll(() => Effect.void));
            },
            { concurrency: "unbounded" },
          );
        }).pipe(Effect.withSpan("CommandManager.materializeUninstall")),

      upsertSettingsEntry: ({
        ref,
      }: {
        readonly ref: CommandExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        if (ref.refType !== "registry") return Effect.void.pipe(Effect.withSpan("CommandManager.upsertSettingsEntry"));
        const registryRef = ref as RegistryCommandRef;
        return validateExactResolvedVersion(
          `commands.${ref.command.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildCommandLockEntry(registryRef, new Date());
            return ws.setCommand({ name: ref.command.name, lockEntry });
          }),
          Effect.withSpan("CommandManager.upsertSettingsEntry"),
        );
      },

      removeSettingsEntry: ({ target }: { readonly target: CommandExtensionTarget }) =>
        ws.removeCommandSettings(target.name).pipe(
          Effect.withSpan("CommandManager.removeSettingsEntry"),
        ),

      upsertLockfileEntry: ({ ref }: { readonly ref: CommandExtensionRef }) => {
        if (ref.refType !== "registry") return Effect.void.pipe(Effect.withSpan("CommandManager.upsertLockfileEntry"));
        const registryRef = ref as RegistryCommandRef;
        return validateExactResolvedVersion(
          `commands.${ref.command.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildCommandLockEntry(registryRef, new Date());
            return ws.setCommandLock({ name: ref.command.name, lockEntry });
          }),
          Effect.withSpan("CommandManager.upsertLockfileEntry"),
        );
      },

      removeLockfileEntry: ({ target }: { readonly target: CommandExtensionTarget }) =>
        ws.removeCommandLock(target.name).pipe(
          Effect.withSpan("CommandManager.removeLockfileEntry"),
        ),
    } satisfies ExtensionManager<CommandExtensionRef>;
  }),
);
