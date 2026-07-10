/**
 * Command extension manager service.
 *
 * Implements ExtensionManager<CommandExtensionRef> with support for all ref
 * types (registry, git-hosted, local). Delegates to existing command
 * materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { configuredCommandsToDiskRefs } from "../extensions/materializable-from-disk.js";
import type {
  CommandExtensionRef,
  GitHostedCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
  WorkspaceCommandRef,
} from "./refs.js";
import type { CommandLockEntry } from "../lockfile/index.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import type { ExtensionManager, CommandExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  computeSourceHash,
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  RenderedFilesMapSchema,
  type SourceHash,
  materializeExternalPackage,
  materializeRegistryPackage,
  validatePathSafety,
} from "../extensions/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { CodingAgentRepository } from "../agents/index.js";
import {
  checkInstalledOnDisk,
  readCommandContent,
  renderToAgents,
} from "./operations/shared-command-helpers.js";

const decodeRenderedFilesMap = Schema.decodeUnknownSync(RenderedFilesMapSchema);

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class CommandManager extends ServiceMap.Service<
  CommandManager,
  ExtensionManager<CommandExtensionRef>
>()("@agentxm/client-core/unstable/commands/manager/CommandManager") {}

// Build lock entry from registry ref
const buildCommandLockEntry = (ref: RegistryCommandRef, now: Date): CommandLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  agents: [],
  installedAt: now,
  updatedAt: now,
});

// Build lock entry for git-hosted refs
const buildGitHostedCommandLockEntry = (ref: GitHostedCommandRef, now: Date): CommandLockEntry => {
  const source = ref.source;
  return {
    ...gitSourceLockFields(source, ref.gitTreeSha),
    agents: [],
    installedAt: now,
    updatedAt: now,
  };
};

// Build lock entry for local refs
const localSourceLockPath = (
  ref: LocalCommandRef,
  workspaceRelativeLocalSourcePath?: Option.Option<string>,
): string =>
  Option.getOrElse(workspaceRelativeLocalSourcePath ?? Option.none(), () => ref.source.path);

const buildLocalCommandLockEntry = (
  ref: LocalCommandRef,
  now: Date,
  workspaceRelativeLocalSourcePath?: Option.Option<string>,
): CommandLockEntry => ({
  type: "local",
  path: localSourceLockPath(ref, workspaceRelativeLocalSourcePath),
  agents: [],
  installedAt: now,
  updatedAt: now,
});

const buildWorkspaceCommandLockEntry = (ref: WorkspaceCommandRef, now: Date): CommandLockEntry => ({
  type: "workspace",
  owner: ref.owner,
  extensionType: "command",
  name: ref.name,
  version: ref.version,
  sourceHash: ref.sourceHash,
  agents: [],
  installedAt: now,
  updatedAt: now,
});

/**
 * Build a CommandLockEntry from any ref type.
 */
export const buildLockEntryFromRef = (
  ref: CommandExtensionRef,
  now: Date,
  workspaceRelativeLocalSourcePath?: Option.Option<string>,
): CommandLockEntry => {
  switch (ref.refType) {
    case "registry":
      return buildCommandLockEntry(ref, now);
    case "git-hosted":
      return buildGitHostedCommandLockEntry(ref, now);
    case "local":
      return buildLocalCommandLockEntry(ref, now, workspaceRelativeLocalSourcePath);
    case "workspace":
      return buildWorkspaceCommandLockEntry(ref, now);
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
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const serviceLayer = Layer.merge(
      fsPathLayer,
      Layer.merge(
        Layer.succeed(CodingAgentRepository, agentRepo),
        Layer.succeed(WorkspaceMutations, ws),
      ),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, serviceLayer);
    const lastInstallState = new Map<
      string,
      {
        readonly agents: ReadonlyArray<string>;
        readonly sourceHash: SourceHash;
        readonly renderedFiles: NonNullable<CommandLockEntry["renderedFiles"]>;
      }
    >();

    const materializeFromRegistry = (ref: RegistryCommandRef) =>
      provide(
        materializeRegistryPackage({
          baseDir,
          canonicalPath: path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            ref.owner,
            "commands",
            ref.name,
          ),
          sourceLocation: ref.source.location,
          owner: ref.owner,
          type: "command",
          name: ref.name,
          version: ref.version,
          integrity: ref.integrity,
          messages: {
            existsFailureDetail: (canonicalPath) =>
              `Failed to check if canonical path exists: ${canonicalPath}`,
            integrityMismatchCode: "internal",
            integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
            tempDirectoryFailureDetail:
              "Temporary directory for registry install could not be created",
            createDirectoryFailureDetail: (canonicalPath) =>
              `Failed to create canonical directory: ${canonicalPath}`,
            inspectExtractedFailureDetail: "Extracted directory could not be read",
            copyEntryFailureCode: "validation",
            copyEntryFailureDetail: (entry) =>
              `Failed to copy registry command package entry: ${entry}`,
          },
        }),
      );

    const materializeFromExternal = (ref: GitHostedCommandRef | LocalCommandRef) =>
      provide(
        materializeExternalPackage({
          baseDir,
          canonicalPath: path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, "commands", ref.command.name),
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) => `Failed to copy command files to ${canonicalPath}`,
        }),
      );

    const materializeInstall: ExtensionManager<CommandExtensionRef>["materializeInstall"] =
      Effect.fn("CommandManager.materializeInstall")(function* ({ ref }) {
        const canonicalPath = yield* Effect.gen(function* () {
          switch (ref.refType) {
            case "registry":
              return yield* materializeFromRegistry(ref);
            case "git-hosted":
            case "local":
              return yield* materializeFromExternal(ref);
            case "workspace":
              return ref.location;
          }
        });

        const { frontmatter, agentOverrides, body, manifest, contentPath } = yield* provide(
          readCommandContent(canonicalPath, ref.command.name, "INSTALL_COMMAND"),
        );
        const editSourcePath = makeWorkspaceRelativeSourcePath(path, baseDir, contentPath);
        if (Option.isNone(editSourcePath)) {
          return yield* makeAppError({
            code: "internal",
            detail: `Command source path escapes workspace root: ${contentPath}`,
          });
        }

        const owner =
          ref.refType === "registry" || ref.refType === "workspace"
            ? ref.owner
            : yield* ws.getConfiguredOwner().pipe(
                Effect.flatMap(
                  Option.match({
                    onNone: () =>
                      Effect.fail(
                        makeAppError({
                          code: "internal",
                          detail: `Cannot sync non-registry command "${ref.command.name}" without a configured owner`,
                          suggestions: [
                            {
                              description:
                                "Set `owner` in `.axm/settings.json` (project or global) before syncing non-registry commands.",
                            },
                          ],
                        }),
                      ),
                    onSome: Effect.succeed,
                  }),
                ),
              );

        const renderResult = yield* provide(
          renderToAgents({
            commandName: ref.command.name,
            editSourcePath: editSourcePath.value,
            frontmatter,
            agentOverrides: Option.getOrUndefined(agentOverrides),
            body,
            manifest,
            owner,
            workspaceRoot: baseDir,
            force: false,
          }),
        );
        lastInstallState.set(ref.command.name, {
          agents: renderResult.successfulAgents,
          sourceHash: computeSourceHash(body),
          renderedFiles: decodeRenderedFilesMap(renderResult.rawRenderedFiles),
        });
      }, Effect.asVoid);

    const materializeUninstall: ExtensionManager<CommandExtensionRef>["materializeUninstall"] =
      Effect.fn("CommandManager.materializeUninstall")(function* ({ target, preserveSource }) {
        const lockEntry = yield* ws.getLockedCommand(target.name);
        if (Option.isSome(lockEntry) && lockEntry.value.renderedFiles !== undefined) {
          const renderedPaths = Object.values(lockEntry.value.renderedFiles).flatMap((files) =>
            files.map((file) => file.path),
          );
          yield* Effect.forEach(
            renderedPaths,
            (renderedPath) =>
              Effect.gen(function* () {
                const absolutePath = path.resolve(baseDir, renderedPath);
                yield* validatePathSafety(baseDir, absolutePath);
                yield* fs.remove(absolutePath).pipe(Effect.catch(() => Effect.void));
              }),
            { concurrency: "unbounded" },
          );
        }

        // Remove from registry extensions dirs
        const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
        const extensionsDirExists = yield* fs
          .exists(extensionsDir)
          .pipe(Effect.catch(() => Effect.succeed(false)));

        if (extensionsDirExists && preserveSource !== true) {
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
        const installedCommands = yield* ws.records.getInstalledCommands();
        if (target.name in installedCommands) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      getConfiguredSource: Effect.fn("CommandManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.records.getConfiguredCommands();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("CommandManager.listMaterializable")(function* () {
        const configured = yield* ws.records.getConfiguredCommands();
        return yield* configuredCommandsToDiskRefs(
          { fs, path, baseDir, scope: ws.scope },
          configured,
        );
      }),
      materializeUninstall,

      upsertSettingsEntry: Effect.fn("CommandManager.upsertSettingsEntry")(function* ({
        ref,
      }: {
        readonly ref: CommandExtensionRef;
        readonly versionRange: Option.Option<string>;
      }) {
        const now = new Date();
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local command source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const lockEntry = buildLockEntryFromRef(ref, now, workspaceRelativeLocalSourcePath);
        const state = lastInstallState.get(ref.command.name);
        const lockEntryWithMaterialization =
          state === undefined
            ? lockEntry
            : {
                ...lockEntry,
                agents: [...state.agents],
                sourceHash: state.sourceHash,
                renderedFiles: state.renderedFiles,
              };
        if (lockEntryWithMaterialization.type === "registry") {
          yield* validateExactResolvedVersion(
            `commands.${ref.command.name}.resolvedVersion`,
            lockEntryWithMaterialization.resolvedVersion,
          );
        }
        return yield* ws.setCommand({
          name: ref.command.name,
          lockEntry: lockEntryWithMaterialization,
        });
      }),

      removeSettingsEntry: ({ target }: { readonly target: CommandExtensionTarget }) =>
        ws
          .removeCommandSettings(target.name)
          .pipe(Effect.withSpan("CommandManager.removeSettingsEntry")),

      upsertLockfileEntry: Effect.fn("CommandManager.upsertLockfileEntry")(function* ({
        ref,
      }: {
        readonly ref: CommandExtensionRef;
      }) {
        const now = new Date();
        const workspaceRelativeLocalSourcePath =
          ref.refType === "local"
            ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
            : Option.none();
        if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Local command source path must stay within the workspace root: ${ref.source.path}`,
          });
        }
        const lockEntry = buildLockEntryFromRef(ref, now, workspaceRelativeLocalSourcePath);
        const state = lastInstallState.get(ref.command.name);
        const lockEntryWithMaterialization =
          state === undefined
            ? lockEntry
            : {
                ...lockEntry,
                agents: [...state.agents],
                sourceHash: state.sourceHash,
                renderedFiles: state.renderedFiles,
              };
        if (lockEntryWithMaterialization.type === "registry") {
          yield* validateExactResolvedVersion(
            `commands.${ref.command.name}.resolvedVersion`,
            lockEntryWithMaterialization.resolvedVersion,
          );
        }
        return yield* ws.setCommandLock({
          name: ref.command.name,
          lockEntry: lockEntryWithMaterialization,
        });
      }),

      removeLockfileEntry: ({ target }: { readonly target: CommandExtensionTarget }) =>
        ws
          .removeCommandLock(target.name)
          .pipe(Effect.withSpan("CommandManager.removeLockfileEntry")),
    } satisfies ExtensionManager<CommandExtensionRef>;
  }),
);
