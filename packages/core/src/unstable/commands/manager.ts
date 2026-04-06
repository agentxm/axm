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

import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError } from "../app-error/index.js";
import { computeIntegrity, isPathSafe } from "../utils/index.js";
import type { CommandExtensionRef, RegistryCommandRef } from "./refs.js";
import type { CommandLockEntry } from "../lockfile/index.js";
import type { ExtensionManager, CommandExtensionTarget } from "../workspace/service-interface.js";
import { Workspace } from "../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeExactSemverVersionSync } from "../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class CommandManager extends ServiceMap.Service<
  CommandManager,
  ExtensionManager<CommandExtensionRef>
>()("@axm.sh/cli/CommandManager") {}

// Build lock entry from registry ref
const buildCommandLockEntry = (ref: RegistryCommandRef, now: Date): CommandLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeExactSemverVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  installedAt: now,
  updatedAt: now,
});

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  commandName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const commandPath = pathService.join(extensionsDir, scopeDir, "commands", commandName);
        return fsService.exists(commandPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
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

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    const materializeInstall: ExtensionManager<CommandExtensionRef>["materializeInstall"] =
      Effect.fn("CommandManager.materializeInstall")(function* ({ ref }) {
        if (ref.refType !== "registry") {
          return yield* makeAppError({
            code: "INSTALL_COMMAND_UNSUPPORTED_REF_TYPE",
            what: `Unsupported ref type for command install: ${ref.refType}`,
          });
        }

        const registryRef = ref;
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          registryRef.owner,
          "commands",
          registryRef.name,
        );

        if (!isPathSafe(baseDir, canonicalPath)) {
          return yield* makeAppError({
            code: "INSTALL_COMMAND_PATH_TRAVERSAL",
            what: `Path traversal detected: ${canonicalPath}`,
          });
        }

        const canonicalExists = yield* fs.exists(canonicalPath).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "INSTALL_COMMAND_PATH_CHECK_FAILED",
              what: `Failed to check if canonical path exists: ${canonicalPath}`,
              cause: e,
            }),
          ),
        );
        const useExisting = Option.isNone(registryRef.integrity) && canonicalExists;

        if (!useExisting) {
          const locationStr =
            registryRef.source.location.protocol === "file:"
              ? registryRef.source.location.pathname
              : registryRef.source.location.href;
          const client = yield* provide(createRegistryClient(locationStr));
          const { archive } = yield* client.getExtensionPackage({
            owner: registryRef.owner,
            type: "command",
            name: registryRef.name,
            version: Option.some(registryRef.version),
          });

          if (Option.isSome(registryRef.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== registryRef.integrity.value) {
              return yield* makeAppError({
                code: "INSTALL_COMMAND_INTEGRITY_MISMATCH",
                what: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
                details: [`Expected ${registryRef.integrity.value}, got ${actualIntegrity}`],
              });
            }
          }

          const tmpDir = yield* fs.makeTempDirectory().pipe(
            Effect.mapError((e) =>
              makeAppError({
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
                  makeAppError({
                    code: "INSTALL_COMMAND_COPY_FAILED",
                    what: `Failed to create canonical directory: ${canonicalPath}`,
                    cause: e,
                  }),
                ),
              );
              const entries = yield* fs.readDirectory(tmpDir).pipe(
                Effect.mapError((e) =>
                  makeAppError({
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
                  return fs.copy(src, dest).pipe(Effect.ignore);
                },
                { concurrency: "unbounded" },
              );
            }),
            fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
          );
        }
      }, Effect.asVoid);

    const materializeUninstall: ExtensionManager<CommandExtensionRef>["materializeUninstall"] =
      Effect.fn("CommandManager.materializeUninstall")(function* ({ target }) {
        const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
        const extensionsDirExists = yield* fs
          .exists(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed(false)));

        if (!extensionsDirExists) return;

        const scopeDirs = yield* fs
          .readDirectory(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

        yield* Effect.forEach(
          scopeDirs,
          (scopeDir) => {
            if (!scopeDir.startsWith("@")) return Effect.void;
            const cmdPath = path.join(extensionsDir, scopeDir, "commands", target.name);
            return fs.remove(cmdPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
          },
          { concurrency: "unbounded" },
        );
      }, Effect.asVoid);

    return {
      type: "command",
      isInstalled: Effect.fn("CommandManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: CommandExtensionTarget;
      }) {
        const installedCommands = yield* ws.getInstalledCommands();
        if (target.name in installedCommands) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      materializeUninstall,

      upsertSettingsEntry: ({
        ref,
      }: {
        readonly ref: CommandExtensionRef;
        readonly versionConstraint: Option.Option<string>;
      }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("CommandManager.upsertSettingsEntry"));
        const registryRef = ref;
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
        ws
          .removeCommandSettings(target.name)
          .pipe(Effect.withSpan("CommandManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: CommandExtensionRef }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("CommandManager.upsertLockfileEntry"));
        const registryRef = ref;
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
        ws
          .removeCommandLock(target.name)
          .pipe(Effect.withSpan("CommandManager.removeLockfileEntry")),
    } satisfies ExtensionManager<CommandExtensionRef>;
  }),
);
