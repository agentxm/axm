import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { CodingAgentRepository } from "../agents/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { WorkspaceMutations } from "./service-interface.js";

export const AXM_MANAGED_MARKER = "AXM managed";

export interface RenderedFileCleanupResult {
  readonly removedPaths: ReadonlyArray<string>;
}

export interface RemovedAgentArtifactCleanupResult {
  readonly removedPaths: ReadonlyArray<string>;
}

const extensionNameFromFilename = (fileName: string): string => {
  const dotIndex = fileName.indexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
};

export const hasAxmManagedMarker = (content: string): boolean =>
  content.includes(AXM_MANAGED_MARKER) || content.includes("_axm_managed");

const isWithin = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const removePath = (fs: FileSystem.FileSystem, filePath: string): Effect.Effect<void, AppError> =>
  fs.remove(filePath, { recursive: true }).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "internal",
        detail: `Failed to remove managed agent artifact: ${filePath}`,
        cause: error,
      }),
    ),
  );

const safeReadDirectory = (fs: FileSystem.FileSystem, dir: string, recursive = false) =>
  fs
    .readDirectory(dir, recursive ? { recursive: true } : undefined)
    .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

const safeReadFileString = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.readFileString(filePath).pipe(Effect.catch(() => Effect.succeed("")));

const hasManagedSkillCopyMarker = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  artifactPath: string,
) =>
  safeReadFileString(fs, path.join(artifactPath, "SKILL.md")).pipe(Effect.map(hasAxmManagedMarker));

const cleanupSkillArtifactsInDir = (args: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly baseDir: string;
  readonly skillsDir: string;
}) =>
  Effect.gen(function* () {
    const removedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(args.fs, args.skillsDir);
    const extensionsDir = args.path.join(args.baseDir, REGISTRY_EXTENSIONS_DIR);

    for (const entry of entries) {
      const artifactPath = args.path.join(args.skillsDir, entry);
      const linkTarget = yield* args.fs.readLink(artifactPath).pipe(Effect.option);
      if (linkTarget._tag === "Some") {
        const resolvedTarget = args.path.resolve(args.skillsDir, linkTarget.value);
        if (!isWithin(args.path, extensionsDir, resolvedTarget)) continue;
        yield* removePath(args.fs, artifactPath);
        removedPaths.push(artifactPath);
        continue;
      }

      const stat = yield* args.fs.stat(artifactPath).pipe(Effect.option);
      if (stat._tag === "None" || stat.value.type !== "Directory") continue;
      const managedCopy = yield* hasManagedSkillCopyMarker(args.fs, args.path, artifactPath);
      if (!managedCopy) continue;
      yield* removePath(args.fs, artifactPath);
      removedPaths.push(artifactPath);
    }

    return removedPaths;
  });

const cleanupCommandArtifactsInDir = (args: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly commandsDir: string;
}) =>
  Effect.gen(function* () {
    const removedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(args.fs, args.commandsDir, true);

    for (const entry of entries) {
      const filePath = args.path.join(args.commandsDir, entry);
      const stat = yield* args.fs.stat(filePath).pipe(Effect.option);
      if (stat._tag === "None" || stat.value.type !== "File") continue;
      const content = yield* safeReadFileString(args.fs, filePath);
      if (!hasAxmManagedMarker(content)) continue;
      yield* removePath(args.fs, filePath);
      removedPaths.push(filePath);
    }

    return removedPaths;
  });

const cleanupSubagentArtifactsInDir = (args: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly subagentsDir: string;
}) =>
  Effect.gen(function* () {
    const removedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(args.fs, args.subagentsDir);

    for (const entry of entries) {
      const filePath = args.path.join(args.subagentsDir, entry);
      const stat = yield* args.fs.stat(filePath).pipe(Effect.option);
      if (stat._tag === "None" || stat.value.type !== "File") continue;
      const content = yield* safeReadFileString(args.fs, filePath);
      if (!hasAxmManagedMarker(content)) continue;
      yield* removePath(args.fs, filePath);
      removedPaths.push(filePath);
    }

    return removedPaths;
  });

/** Discover AXM-managed subagent files without mutating the workspace. */
export const findManagedSubagentFiles = (subagentsDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const managedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(fs, subagentsDir);

    for (const entry of entries) {
      const filePath = path.join(subagentsDir, entry);
      const stat = yield* fs.stat(filePath).pipe(Effect.option);
      if (stat._tag === "None" || stat.value.type !== "File") continue;
      const content = yield* safeReadFileString(fs, filePath);
      if (hasAxmManagedMarker(content)) managedPaths.push(filePath);
    }

    return managedPaths;
  });

/**
 * Remove AXM-managed skill, command, and subagent artifacts from agents that
 * are no longer configured for a workspace. This only removes
 * symlinks/copies/files with AXM-managed signals and leaves user-authored files
 * untouched.
 */
export const cleanupManagedArtifactsForRemovedAgents = (args: {
  readonly removedAgentIds: ReadonlySet<string>;
}): Effect.Effect<
  RemovedAgentArtifactCleanupResult,
  AppError,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const agents = yield* agentRepo.all;
    const removedPaths: Array<string> = [];

    for (const agent of agents) {
      if (!args.removedAgentIds.has(agent.id)) continue;

      const skillsDir = yield* agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir });
      if (skillsDir._tag === "supported") {
        const skillPaths = yield* cleanupSkillArtifactsInDir({
          fs,
          path,
          baseDir: ws.baseDir,
          skillsDir: skillsDir.dir,
        });
        removedPaths.push(...skillPaths);
      }

      const commandsDir = yield* agent.resolveEffectiveCommandsDir({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
      });
      if (commandsDir._tag === "supported") {
        const commandPaths = yield* cleanupCommandArtifactsInDir({
          fs,
          path,
          commandsDir: commandsDir.dir,
        });
        removedPaths.push(...commandPaths);
      }

      const subagentsDir = yield* agent.resolveEffectiveSubagentsDir({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
      });
      if (subagentsDir._tag === "supported") {
        const subagentPaths = yield* cleanupSubagentArtifactsInDir({
          fs,
          path,
          subagentsDir: subagentsDir.dir,
        });
        removedPaths.push(...subagentPaths);
      }
    }

    return { removedPaths };
  });

export const cleanupStaleManagedSubagentFiles = (args: {
  readonly expectedSubagentNames: ReadonlySet<string>;
}): Effect.Effect<
  RenderedFileCleanupResult,
  AppError,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const configuredAgentIds = new Set(yield* ws.getConfiguredAgents());
    const agents = yield* agentRepo.all;
    const removedPaths: Array<string> = [];

    for (const agent of agents) {
      const resolved = yield* agent.resolveEffectiveSubagentsDir({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
      });
      if (resolved._tag !== "supported") continue;

      const exists = yield* fs.exists(resolved.dir).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) continue;

      const entries = yield* fs
        .readDirectory(resolved.dir)
        .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

      for (const entry of entries) {
        const filePath = path.join(resolved.dir, entry);
        const stat = yield* fs.stat(filePath).pipe(Effect.option);
        if (stat._tag === "None" || stat.value.type !== "File") continue;

        const content = yield* fs
          .readFileString(filePath)
          .pipe(Effect.catch(() => Effect.succeed("")));
        if (!hasAxmManagedMarker(content)) continue;

        const expected =
          configuredAgentIds.has(agent.id) &&
          args.expectedSubagentNames.has(extensionNameFromFilename(entry));
        if (expected) continue;

        yield* fs.remove(filePath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to remove stale managed subagent file: ${filePath}`,
              cause: error,
            }),
          ),
        );
        removedPaths.push(filePath);
      }
    }

    return { removedPaths };
  });
