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
} from "./refs.js";
import type { CommandLockEntry } from "../lockfile/index.js";
import type { ExtensionManager, CommandExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  computeSourceHash,
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  RenderedFilesMapSchema,
} from "../extensions/index.js";
import {
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/materialization.js";
import {
  gitHostedLockSourceFields,
  localLockSourceFields,
  registryLockSourceFields,
} from "../lockfile/entry-helpers.js";
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

/**
 * Build a CommandLockEntry from any ref type.
 */
export const buildLockEntryFromRef = (
  ref: CommandExtensionRef,
  now: Date,
  workspaceRelativeLocalSourcePath?: Option.Option<string>,
): CommandLockEntry => {
  const common = {
    agents: [],
    installedAt: now,
    updatedAt: now,
  };

  switch (ref.refType) {
    case "registry":
      return {
        ...registryLockSourceFields({
          owner: ref.owner,
          name: ref.name,
          version: decodeVersionSync(ref.version),
          integrity: ref.integrity,
        }),
        ...common,
      };
    case "git-hosted":
      return {
        ...gitHostedLockSourceFields(ref.source, ref.gitTreeSha),
        ...common,
      };
    case "local":
      return {
        ...localLockSourceFields({
          source: ref.source,
          workspaceRelativeLocalSourcePath,
        }),
        ...common,
      };
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
        readonly sourceHash: string;
        readonly renderedFiles: CommandLockEntry["renderedFiles"];
      }
    >();

    const materializeFromRegistry = (ref: RegistryCommandRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          ref.owner,
          "commands",
          ref.name,
        );

        return yield* provide(
          materializeRegistryPackage({
            baseDir,
            canonicalPath,
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "command",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
          }),
        );
      });

    const materializeFromGitHosted = (ref: GitHostedCommandRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          EXTERNAL_EXTENSIONS_DIR,
          "commands",
          ref.command.name,
        );

        return yield* provide(
          materializeExternalPackage({
            baseDir,
            canonicalPath,
            sourceLocation: ref.location,
            packageLabel: "command",
          }),
        );
      });

    const materializeFromLocal = (ref: LocalCommandRef) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          EXTERNAL_EXTENSIONS_DIR,
          "commands",
          ref.command.name,
        );

        return yield* provide(
          materializeExternalPackage({
            baseDir,
            canonicalPath,
            sourceLocation: ref.location,
            packageLabel: "command",
          }),
        );
      });

    const materializeInstall: ExtensionManager<CommandExtensionRef>["materializeInstall"] =
      Effect.fn("CommandManager.materializeInstall")(function* ({ ref }) {
        const canonicalPath = yield* Effect.gen(function* () {
          switch (ref.refType) {
            case "registry":
              return yield* materializeFromRegistry(ref);
            case "git-hosted":
              return yield* materializeFromGitHosted(ref);
            case "local":
              return yield* materializeFromLocal(ref);
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
          ref.refType === "registry"
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
        const installedCommands = yield* ws.records.getInstalledCommands();
        if (target.name in installedCommands) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      listMaterializable: Effect.fn("CommandManager.listMaterializable")(function* () {
        const configured = yield* ws.records.getConfiguredCommands();
        return yield* configuredCommandsToDiskRefs({ fs, path, baseDir }, configured);
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
