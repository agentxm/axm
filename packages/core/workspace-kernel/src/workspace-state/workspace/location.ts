/**
 * Workspace location: the resolved identity of the selected workspace scope.
 *
 * One value per workspace lifetime naming the scope, its runtime state
 * directory, the two shared authoritative files, the project and user
 * runtime directories both settings sources live in, and the resolved
 * layout. The layout is a `Ref` because recording an owner replaces it for
 * the resolution that follows in the same run; only `SettingsWriter.setOwner`
 * updates it. Every narrow state service reads its paths from here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { envOption } from "@agentxm/host-primitives";

import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  createDefaultSettings,
  type Settings,
  type SourceHostConfig,
} from "../desired/settings/index.js";
import type { Lockfile } from "../desired/lockfile/schema.js";
import { WorkspaceNotInitialized } from "./errors.js";
import {
  resolveProjectWorkspaceLayout,
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "./layout.js";
import { getProjectRuntimeDir, resolveUserHome } from "./paths.js";
import { LockfileVersionUnsupported } from "../observed/errors.js";
import type {
  WorkspaceLockfileReadFailure,
  WorkspaceStateError,
  WorkspaceStateOptions,
  WorkspaceSettingsReadFailure,
} from "./contracts.js";
import { readLockfileCell, readSettingsCell, type StateCellPaths } from "./state-cells.js";

export interface WorkspaceLocationService extends StateCellPaths {
  /** Whether this is the user workspace or a project workspace. */
  readonly scope: WorkspaceScope;
  /** User home or project root that anchors scope resolution. */
  readonly baseDir: string;
  /** The selected scope's runtime `.axm` directory. */
  readonly runtimeDir: string;
  readonly settingsPath: string;
  readonly lockPath: string;
  /** The resolved layout; replaced only when an owner is recorded. */
  readonly layout: Ref.Ref<WorkspaceLayout>;
  readonly nativeDirectoryInputs: {
    readonly skillsDirectoryOverrides: Readonly<Partial<Record<string, string>>>;
    readonly xdgConfigRoot?: string;
    readonly userConfigRootOverrides?: Readonly<Partial<Record<string, string>>>;
  };
  /** Built-in registries merged behind project and user settings. */
  readonly builtInSources: ReadonlyArray<SourceHostConfig>;
}

export class WorkspaceLocation extends ServiceMap.Service<
  WorkspaceLocation,
  WorkspaceLocationService
>()("@agentxm/workspace-kernel/workspace-state/WorkspaceLocation") {}

const requireInitializedWorkspace = <R>(
  settingsPath: string,
  settings: Effect.Effect<Option.Option<Settings>, WorkspaceSettingsReadFailure, R>,
  lockfile: Effect.Effect<Lockfile, WorkspaceLockfileReadFailure, R>,
) =>
  settings.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          lockfile.pipe(
            Effect.matchEffect({
              onFailure: (
                error,
              ): Effect.Effect<never, LockfileVersionUnsupported | WorkspaceNotInitialized> =>
                error instanceof LockfileVersionUnsupported &&
                error.observedVersion > error.supportedVersion
                  ? Effect.fail(error)
                  : Effect.fail(new WorkspaceNotInitialized({ settingsPath })),
              onSuccess: (): Effect.Effect<
                never,
                LockfileVersionUnsupported | WorkspaceNotInitialized
              > => Effect.fail(new WorkspaceNotInitialized({ settingsPath })),
            }),
          ),
        onSome: () => Effect.void,
      }),
    ),
  );

/** Capture documented native selection inputs once for a workspace or setup candidate. */
export const captureNativeDirectoryInputs = (userHome: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const claudeSkills = yield* envOption("AXM_CLAUDE_SKILLS_DIR");
    const geminiSkills = yield* envOption("AXM_GEMINI_CLI_SKILLS_DIR");
    const xdgConfig = yield* envOption("XDG_CONFIG_HOME");
    const codexHome = yield* envOption("CODEX_HOME");
    const claudeConfig = yield* envOption("CLAUDE_CONFIG_DIR");
    return {
      userConfigRootOverrides: {
        ...(Option.isSome(codexHome) ? { codex: codexHome.value } : {}),
        ...(Option.isSome(claudeConfig) ? { "claude-code": claudeConfig.value } : {}),
      },
      skillsDirectoryOverrides: {
        ...(Option.isSome(claudeSkills) ? { "claude-code": claudeSkills.value } : {}),
        ...(Option.isSome(geminiSkills) ? { "gemini-cli": geminiSkills.value } : {}),
      },
      xdgConfigRoot: Option.isSome(xdgConfig)
        ? path.resolve(userHome, xdgConfig.value)
        : path.join(userHome, ".config"),
    };
  });

const defaultBuiltInSources: ReadonlyArray<SourceHostConfig> = [];

/**
 * Resolve the workspace location from an existing workspace on disk.
 *
 * The workspace must already be initialized unless `allowUninitialized` is
 * set. Missing or invalid settings and invalid or unsupported lockfiles fail
 * fast with a typed `WorkspaceStateError`.
 */
export const makeWorkspaceLocation = (
  options: WorkspaceStateOptions,
): Effect.Effect<
  WorkspaceLocationService,
  WorkspaceStateError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const userHome = yield* resolveUserHome();
    const nativeDirectoryInputs = yield* captureNativeDirectoryInputs(userHome);
    const initialUserLayout = yield* resolveUserWorkspaceLayout(userHome);
    const userRuntimeDir = initialUserLayout.runtimeDir;
    const projectRuntimeDir = yield* getProjectRuntimeDir(options.projectRoot);
    const runtimeDir = options.scope === "user" ? userRuntimeDir : projectRuntimeDir;
    const initialProjectState = resolveProjectWorkspaceStatePaths(path, options.projectRoot);
    const settingsPath =
      options.scope === "user" ? initialUserLayout.settingsPath : initialProjectState.settingsPath;
    const lockPath =
      options.scope === "user" ? initialUserLayout.lockPath : initialProjectState.lockPath;
    const baseDir: AbsolutePath = options.scope === "user" ? userHome : options.projectRoot;
    const cells: StateCellPaths = {
      ...(options.observationView === undefined
        ? {}
        : { observationView: options.observationView }),
      scope: options.scope,
      nativeDirectoryInputs,
      projectRoot: options.projectRoot,
      userHome,
      projectRuntimeDir,
      userRuntimeDir,
    };

    if (options.allowUninitialized !== true) {
      yield* requireInitializedWorkspace(
        settingsPath,
        readSettingsCell(cells, runtimeDir),
        readLockfileCell(cells, runtimeDir),
      );
      yield* readLockfileCell(cells, runtimeDir);
    }

    const projectSettings = yield* readSettingsCell(cells, projectRuntimeDir, "project").pipe(
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
    );
    const userSettings = yield* readSettingsCell(cells, userRuntimeDir, "user").pipe(
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
    );
    const projectLayout = yield* resolveProjectWorkspaceLayout(
      options.projectRoot,
      projectSettings,
    );
    const userLayout = yield* resolveUserWorkspaceLayout(userHome, userSettings);
    const layout = yield* Ref.make<WorkspaceLayout>(
      options.scope === "project" ? projectLayout : userLayout,
    );

    return {
      ...cells,
      nativeDirectoryInputs,
      baseDir,
      runtimeDir,
      settingsPath,
      lockPath,
      layout,
      builtInSources: options.builtInSources ?? defaultBuiltInSources,
    };
  });
