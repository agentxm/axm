import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { WorkspaceLayoutError } from "./errors.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  ACQUIRED_EXTENSIONS_DIR,
  AXM_DIR_NAME,
  LOCK_FILENAME,
  USER_WORKSPACE_DIRECTORY,
} from "./constants.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { Settings } from "../settings/schema.js";
import { makeAbsolutePath, type AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";

export { LOCK_FILENAME } from "./constants.js";
export const RUNTIME_DIRECTORY = AXM_DIR_NAME;

const DEFAULT_AUTHORED_DIRECTORIES = {
  skill: "skills",
  "mcp-server": "mcps",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<ExtensionType, string>;

const EXTENSION_TYPES: ReadonlyArray<ExtensionType> = [
  "skill",
  "mcp-server",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "pack",
];

export interface ProjectWorkspaceLayout {
  readonly scope: "project";
  readonly workspaceRoot: AbsolutePath;
  readonly projectRoot: AbsolutePath;
  readonly settingsPath: AbsolutePath;
  readonly lockPath: AbsolutePath;
  readonly runtimeDir: AbsolutePath;
  readonly acquiredRoot: AbsolutePath;
  readonly owner?: Handle;
  readonly authoredRoot: (type: ExtensionType) => AbsolutePath;
}

export interface UserWorkspaceLayout {
  readonly scope: "user";
  readonly userHome: AbsolutePath;
  readonly axmHome: AbsolutePath;
  readonly workspaceRoot: AbsolutePath;
  readonly settingsPath: AbsolutePath;
  readonly lockPath: AbsolutePath;
  readonly runtimeDir: AbsolutePath;
  readonly acquiredRoot: AbsolutePath;
  readonly owner?: Handle;
}

export type WorkspaceLayout = ProjectWorkspaceLayout | UserWorkspaceLayout;

export const resolveProjectWorkspaceStatePaths = (path: Path.Path, projectRoot: AbsolutePath) => ({
  settingsPath: makeAbsolutePath(path, path.join(projectRoot, SETTINGS_FILENAME)),
  lockPath: makeAbsolutePath(path, path.join(projectRoot, LOCK_FILENAME)),
  runtimeDir: makeAbsolutePath(path, path.join(projectRoot, RUNTIME_DIRECTORY)),
  acquiredRoot: makeAbsolutePath(path, path.join(projectRoot, ACQUIRED_EXTENSIONS_DIR)),
});

export const configuredAuthoredDirectory = (settings: Settings, type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return settings.skillsConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.skill;
    case "mcp-server":
      return settings.mcpServersConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES["mcp-server"];
    case "subagent":
      return settings.subagentsConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.subagent;
    case "rule":
      return settings.rulesConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.rule;
    case "hook":
      return settings.hooksConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.hook;
    case "knowledge":
      return settings.knowledgeConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.knowledge;
    case "pack":
      return settings.packsConfig?.dir ?? DEFAULT_AUTHORED_DIRECTORIES.pack;
  }
};

const layoutError = (detail: string, cause?: unknown): WorkspaceLayoutError =>
  new WorkspaceLayoutError({ detail, ...(cause === undefined ? {} : { cause }) });

const overlaps = (path: Path.Path, left: string, right: string): boolean => {
  const relative = path.relative(left, right);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const validateLexicalDirectory = (
  path: Path.Path,
  projectRoot: AbsolutePath,
  type: ExtensionType,
  configured: string,
  reservedRoots: ReadonlyArray<string>,
): Effect.Effect<AbsolutePath, WorkspaceLayoutError> => {
  if (
    path.isAbsolute(configured) ||
    configured === "." ||
    path.normalize(configured) !== configured ||
    configured.split(/[\\/]/u).some((segment) => segment === ".." || segment === ".")
  ) {
    return Effect.fail(
      layoutError(
        `Invalid ${type} authored directory "${configured}": expected a normalized workspace-relative path`,
      ),
    );
  }

  const resolved = path.resolve(projectRoot, configured);
  if (!overlaps(path, projectRoot, resolved)) {
    return Effect.fail(
      layoutError(`Invalid ${type} authored directory "${configured}": path escapes the workspace`),
    );
  }
  const collision = reservedRoots.find((reserved) => overlaps(path, reserved, resolved));
  if (collision !== undefined) {
    return Effect.fail(
      layoutError(
        `Invalid ${type} authored directory "${configured}": overlaps reserved path ${collision}`,
      ),
    );
  }
  return Effect.succeed(makeAbsolutePath(path, resolved));
};

const validateExistingAuthoredRoot = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  projectRoot: AbsolutePath,
  type: ExtensionType,
  root: AbsolutePath,
): Effect.Effect<void, WorkspaceLayoutError> =>
  Effect.gen(function* () {
    const exists = yield* fs
      .exists(root)
      .pipe(
        Effect.mapError((cause) =>
          layoutError(`Failed to inspect ${type} authored root ${root}`, cause),
        ),
      );
    if (!exists) return;

    const link = yield* fs.readLink(root).pipe(Effect.option);
    if (Option.isSome(link)) {
      return yield* layoutError(
        `Invalid ${type} authored root ${root}: authored roots cannot be symlinks`,
      );
    }
    const info = yield* fs
      .stat(root)
      .pipe(
        Effect.mapError((cause) =>
          layoutError(`Failed to inspect ${type} authored root ${root}`, cause),
        ),
      );
    if (info.type !== "Directory") {
      return yield* layoutError(`Invalid ${type} authored root ${root}: expected a directory`);
    }

    const realProjectRoot = yield* fs
      .realPath(projectRoot)
      .pipe(Effect.orElseSucceed(() => path.resolve(projectRoot)));
    const realRoot = yield* fs
      .realPath(root)
      .pipe(
        Effect.mapError((cause) =>
          layoutError(`Failed to resolve ${type} authored root ${root}`, cause),
        ),
      );
    if (!overlaps(path, realProjectRoot, realRoot)) {
      return yield* layoutError(
        `Invalid ${type} authored root ${root}: real path escapes the workspace`,
      );
    }

    const children = yield* fs
      .readDirectory(root)
      .pipe(
        Effect.mapError((cause) =>
          layoutError(`Failed to inspect ${type} authored root ${root}`, cause),
        ),
      );
    for (const child of children) {
      const childPath = path.join(root, child);
      const childLink = yield* fs.readLink(childPath).pipe(Effect.option);
      if (Option.isSome(childLink)) {
        return yield* layoutError(
          `Invalid ${type} authored package ${childPath}: direct package directories cannot be symlinks`,
        );
      }
    }
  });

export const resolveProjectWorkspaceLayout = (
  projectRoot: AbsolutePath,
  settings: Settings,
): Effect.Effect<ProjectWorkspaceLayout, WorkspaceLayoutError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const statePaths = resolveProjectWorkspaceStatePaths(path, projectRoot);
    const { runtimeDir, acquiredRoot } = statePaths;
    const agentRoots = Object.values(AGENTS).flatMap((agent) =>
      agent.rootDir === undefined ? [] : [path.join(projectRoot, agent.rootDir)],
    );
    const reservedRoots = [runtimeDir, acquiredRoot, ...agentRoots];
    const roots = new Map<ExtensionType, AbsolutePath>();

    for (const extensionType of EXTENSION_TYPES) {
      const root = yield* validateLexicalDirectory(
        path,
        projectRoot,
        extensionType,
        configuredAuthoredDirectory(settings, extensionType),
        reservedRoots,
      );
      for (const [otherType, otherRoot] of roots) {
        if (overlaps(path, otherRoot, root) || overlaps(path, root, otherRoot)) {
          return yield* layoutError(
            `Invalid ${extensionType} authored directory ${root}: overlaps ${otherType} authored root ${otherRoot}`,
          );
        }
      }
      yield* validateExistingAuthoredRoot(fs, path, projectRoot, extensionType, root);
      roots.set(extensionType, root);
    }

    const authoredRoot = (type: ExtensionType): AbsolutePath => {
      const root = roots.get(type);
      if (root !== undefined) return root;
      return makeAbsolutePath(path, path.join(projectRoot, DEFAULT_AUTHORED_DIRECTORIES[type]));
    };

    return {
      scope: "project",
      workspaceRoot: projectRoot,
      projectRoot,
      settingsPath: statePaths.settingsPath,
      lockPath: statePaths.lockPath,
      runtimeDir,
      acquiredRoot,
      ...(settings.owner === undefined ? {} : { owner: settings.owner }),
      authoredRoot,
    };
  });

export const resolveUserWorkspaceLayout = (
  userHome: AbsolutePath,
  settings: Settings = {},
): Effect.Effect<UserWorkspaceLayout, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const axmHome = makeAbsolutePath(path, path.join(userHome, AXM_DIR_NAME));
    const workspaceRoot = makeAbsolutePath(path, path.join(axmHome, USER_WORKSPACE_DIRECTORY));
    return {
      scope: "user",
      userHome,
      axmHome,
      workspaceRoot,
      settingsPath: makeAbsolutePath(path, path.join(workspaceRoot, SETTINGS_FILENAME)),
      lockPath: makeAbsolutePath(path, path.join(workspaceRoot, LOCK_FILENAME)),
      runtimeDir: makeAbsolutePath(path, path.join(workspaceRoot, RUNTIME_DIRECTORY)),
      acquiredRoot: makeAbsolutePath(path, path.join(workspaceRoot, ACQUIRED_EXTENSIONS_DIR)),
      ...(settings.owner === undefined ? {} : { owner: settings.owner }),
    };
  });
