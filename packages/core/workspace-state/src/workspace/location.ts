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

import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { createDefaultSettings, type Settings, type SourceHostConfig } from "../settings/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { WorkspaceNotInitialized } from "./errors.js";
import {
  resolveProjectWorkspaceLayout,
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "./layout.js";
import { getProjectRuntimeDir, resolveUserHome } from "./paths.js";
import { LockfileVersionUnsupported } from "./read-model/errors.js";
import type {
  WorkspaceLockfileReadFailure,
  WorkspaceMutationsError,
  WorkspaceMutationsOptions,
  WorkspaceSettingsReadFailure,
} from "./service-interface.js";
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
  /** Built-in source hosts merged behind project and user settings. */
  readonly builtInSources: ReadonlyArray<SourceHostConfig>;
}

export class WorkspaceLocation extends ServiceMap.Service<
  WorkspaceLocation,
  WorkspaceLocationService
>()("@agentxm/workspace-state/WorkspaceLocation") {}

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

const defaultBuiltInSources: ReadonlyArray<SourceHostConfig> = [
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

/**
 * Resolve the workspace location from an existing workspace on disk.
 *
 * The workspace must already be initialized unless `allowUninitialized` is
 * set. Missing or invalid settings and invalid or unsupported lockfiles fail
 * fast with a typed `WorkspaceMutationsError`.
 */
export const makeWorkspaceLocation = (
  options: WorkspaceMutationsOptions,
): Effect.Effect<
  WorkspaceLocationService,
  WorkspaceMutationsError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const userHome = yield* resolveUserHome();
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
      scope: options.scope,
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
      baseDir,
      runtimeDir,
      settingsPath,
      lockPath,
      layout,
      builtInSources: options.builtInSources ?? defaultBuiltInSources,
    };
  });
