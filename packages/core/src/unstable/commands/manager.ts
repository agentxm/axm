/**
 * Command extension manager service.
 *
 * Implements ExtensionManager<CommandExtensionRef> with support for all ref
 * types (registry, git-hosted, local). Delegates to existing command
 * materialization functions and workspace service methods.
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
import { computeIntegrity, isPathSafe, stripFileProtocol } from "../utils/index.js";
import type {
  CommandExtensionRef,
  GitHostedCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
} from "./refs.js";
import type { CommandLockEntry } from "../lockfile/index.js";
import type { ExtensionManager, CommandExtensionTarget } from "../workspace/service-interface.js";
import { Workspace } from "../workspace/service-interface.js";
import { EXTERNAL_EXTENSIONS_DIR, REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { copyExtensionDirectory, validatePathSafety } from "../extensions/utils.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeExactSemverVersionSync } from "../version-constraints/version-constraints.js";
import { checkInstalledOnDisk } from "./operations/shared-command-helpers.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class CommandManager extends ServiceMap.Service<
  CommandManager,
  ExtensionManager<CommandExtensionRef>
>()("axm.sh/CommandManager") {}

// Build lock entry from registry ref
const buildCommandLockEntry = (ref: RegistryCommandRef, now: Date): CommandLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeExactSemverVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  agents: [],
  installedAt: now,
  updatedAt: now,
});

// Build lock entry for git-hosted refs
const buildGitHostedCommandLockEntry = (ref: GitHostedCommandRef, now: Date): CommandLockEntry => {
  const source = ref.source;
  switch (source.type) {
    case "github":
      return {
        type: "github",
        owner: source.owner,
        repo: source.repo,
        ...(Option.isSome(source.ref) ? { ref: source.ref.value } : {}),
        ...(Option.isSome(source.subPath) ? { path: source.subPath.value } : {}),
        ...(Option.isSome(ref.gitTreeSha) ? { gitTreeHash: ref.gitTreeSha.value } : {}),
        agents: [],
        installedAt: now,
        updatedAt: now,
      };
    case "gitlab":
      return {
        type: "gitlab",
        owner: source.owner,
        repo: source.repo,
        ...(Option.isSome(source.ref) ? { ref: source.ref.value } : {}),
        ...(Option.isSome(source.subPath) ? { path: source.subPath.value } : {}),
        ...(Option.isSome(ref.gitTreeSha) ? { gitTreeHash: ref.gitTreeSha.value } : {}),
        agents: [],
        installedAt: now,
        updatedAt: now,
      };
    case "bitbucket":
      return {
        type: "bitbucket",
        owner: source.owner,
        repo: source.repo,
        ...(Option.isSome(source.ref) ? { ref: source.ref.value } : {}),
        ...(Option.isSome(source.subPath) ? { path: source.subPath.value } : {}),
        ...(Option.isSome(ref.gitTreeSha) ? { gitTreeHash: ref.gitTreeSha.value } : {}),
        agents: [],
        installedAt: now,
        updatedAt: now,
      };
    case "azurerepos":
      return {
        type: "azurerepos",
        organization: source.organization,
        project: source.project,
        repo: source.repo,
        ...(Option.isSome(source.ref) ? { ref: source.ref.value } : {}),
        ...(Option.isSome(source.subPath) ? { path: source.subPath.value } : {}),
        ...(Option.isSome(ref.gitTreeSha) ? { gitTreeHash: ref.gitTreeSha.value } : {}),
        agents: [],
        installedAt: now,
        updatedAt: now,
      };
    case "git":
      return {
        type: "git",
        url: source.url.href,
        ...(Option.isSome(source.ref) ? { ref: source.ref.value } : {}),
        ...(Option.isSome(ref.gitTreeSha) ? { gitTreeHash: ref.gitTreeSha.value } : {}),
        agents: [],
        installedAt: now,
        updatedAt: now,
      };
  }
};

// Build lock entry for local refs
const buildLocalCommandLockEntry = (ref: LocalCommandRef, now: Date): CommandLockEntry => ({
  type: "local",
  path: ref.source.path,
  agents: [],
  installedAt: now,
  updatedAt: now,
});

/**
 * Build a CommandLockEntry from any ref type.
 */
export const buildLockEntryFromRef = (ref: CommandExtensionRef, now: Date): CommandLockEntry => {
  switch (ref.refType) {
    case "registry":
      return buildCommandLockEntry(ref, now);
    case "git-hosted":
      return buildGitHostedCommandLockEntry(ref, now);
    case "local":
      return buildLocalCommandLockEntry(ref, now);
  }
};

// NOTE: manager.ts previously only checked registry dirs; the shared
// checkInstalledOnDisk also checks the external extensions dir, which is
// strictly more thorough and correct for detecting locally/git-installed
// commands.

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

    // --- Registry materialization ---
    // NOTE: Materialization logic here mirrors install.ts but differs structurally:
    // manager.ts captures fs/path/baseDir from the Layer constructor and uses a
    // `provide` helper for inner effects, while install.ts yields services from
    // the generator. Consolidating would require an architectural change to one
    // of the two patterns.
    const materializeFromRegistry = (ref: RegistryCommandRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          ref.owner,
          "commands",
          ref.name,
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
        const useExisting = Option.isNone(ref.integrity) && canonicalExists;

        if (!useExisting) {
          const locationStr =
            ref.source.location.protocol === "file:"
              ? ref.source.location.pathname
              : ref.source.location.href;
          const client = yield* provide(createRegistryClient(locationStr));
          const { archive } = yield* client.getExtensionPackage({
            owner: ref.owner,
            type: "command",
            name: ref.name,
            version: Option.some(ref.version),
          });

          if (Option.isSome(ref.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== ref.integrity.value) {
              return yield* makeAppError({
                code: "INSTALL_COMMAND_INTEGRITY_MISMATCH",
                what: `Integrity mismatch for ${ref.name}@${ref.version}`,
                details: [`Expected ${ref.integrity.value}, got ${actualIntegrity}`],
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

        return canonicalPath;
      });

    // --- Git-hosted materialization ---
    const materializeFromGitHosted = (ref: GitHostedCommandRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          EXTERNAL_EXTENSIONS_DIR,
          "commands",
          ref.command.name,
        );
        yield* validatePathSafety(baseDir, canonicalPath, "INSTALL_COMMAND_PATH_TRAVERSAL");

        const sourcePath = stripFileProtocol(ref.location);
        yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
        yield* provide(
          copyExtensionDirectory(sourcePath, canonicalPath).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "INSTALL_COMMAND_COPY_FAILED",
                what: `Failed to copy command files to ${canonicalPath}`,
                cause: e,
              }),
            ),
          ),
        );

        return canonicalPath;
      });

    // --- Local materialization ---
    const materializeFromLocal = (ref: LocalCommandRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          EXTERNAL_EXTENSIONS_DIR,
          "commands",
          ref.command.name,
        );
        yield* validatePathSafety(baseDir, canonicalPath, "INSTALL_COMMAND_PATH_TRAVERSAL");

        const sourcePath = stripFileProtocol(ref.location);
        const isSelfCopy = path.resolve(sourcePath) === path.resolve(canonicalPath);
        if (!isSelfCopy) {
          yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
          yield* provide(
            copyExtensionDirectory(sourcePath, canonicalPath).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "INSTALL_COMMAND_COPY_FAILED",
                  what: `Failed to copy command files to ${canonicalPath}`,
                  cause: e,
                }),
              ),
            ),
          );
        }

        return canonicalPath;
      });

    const materializeInstall: ExtensionManager<CommandExtensionRef>["materializeInstall"] =
      Effect.fn("CommandManager.materializeInstall")(function* ({ ref }) {
        switch (ref.refType) {
          case "registry":
            yield* materializeFromRegistry(ref);
            break;
          case "git-hosted":
            yield* materializeFromGitHosted(ref);
            break;
          case "local":
            yield* materializeFromLocal(ref);
            break;
        }
      }, Effect.asVoid);

    const materializeUninstall: ExtensionManager<CommandExtensionRef>["materializeUninstall"] =
      Effect.fn("CommandManager.materializeUninstall")(function* ({ target }) {
        // Remove from registry extensions dirs
        const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
        const extensionsDirExists = yield* fs
          .exists(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed(false)));

        if (extensionsDirExists) {
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
        }

        // Remove from external extensions dir
        const externalPath = path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, "commands", target.name);
        yield* fs.remove(externalPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
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
        const now = new Date();
        const lockEntry = buildLockEntryFromRef(ref, now);
        if (lockEntry.type === "registry") {
          return validateExactResolvedVersion(
            `commands.${ref.command.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          ).pipe(
            Effect.flatMap(() => ws.setCommand({ name: ref.command.name, lockEntry })),
            Effect.withSpan("CommandManager.upsertSettingsEntry"),
          );
        }
        return ws
          .setCommand({ name: ref.command.name, lockEntry })
          .pipe(Effect.withSpan("CommandManager.upsertSettingsEntry"));
      },

      removeSettingsEntry: ({ target }: { readonly target: CommandExtensionTarget }) =>
        ws
          .removeCommandSettings(target.name)
          .pipe(Effect.withSpan("CommandManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: CommandExtensionRef }) => {
        const now = new Date();
        const lockEntry = buildLockEntryFromRef(ref, now);
        if (lockEntry.type === "registry") {
          return validateExactResolvedVersion(
            `commands.${ref.command.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          ).pipe(
            Effect.flatMap(() => ws.setCommandLock({ name: ref.command.name, lockEntry })),
            Effect.withSpan("CommandManager.upsertLockfileEntry"),
          );
        }
        return ws
          .setCommandLock({ name: ref.command.name, lockEntry })
          .pipe(Effect.withSpan("CommandManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: CommandExtensionTarget }) =>
        ws
          .removeCommandLock(target.name)
          .pipe(Effect.withSpan("CommandManager.removeLockfileEntry")),
    } satisfies ExtensionManager<CommandExtensionRef>;
  }),
);
