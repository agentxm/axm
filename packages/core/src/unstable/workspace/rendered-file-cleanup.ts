import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  CodingAgentRepository,
  pruneManagedMcpServersForAgent,
  type CodingAgent,
} from "../agents/index.js";
import { AGENTS as CAPABILITY_AGENTS } from "../agent-capabilities/index.js";
import { LEAF_EXTENSION_TYPES, type LeafExtensionType } from "../extension-types/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { stripManagedHooksFromJson } from "../hooks/managed-groups.js";
import type { WorkspaceScope } from "./scope.js";
import { WorkspaceMutations } from "./service-interface.js";

// Match the full managed-file banner ("AXM managed file — do not edit
// directly…"), not a bare "AXM managed" substring: the loose form would flag —
// and delete — user-authored files that merely mention the phrase or carry a
// managed region.
export const AXM_MANAGED_MARKER = "AXM managed file";

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

interface RemovedAgentCleanupContext {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly agent: CodingAgent;
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
}

type RemovedAgentCleanup = (
  context: RemovedAgentCleanupContext,
) => Effect.Effect<ReadonlyArray<string>, AppError, FileSystem.FileSystem | Path.Path>;

const NO_PATHS: ReadonlyArray<string> = [];

const cleanupAgentSkills: RemovedAgentCleanup = (context) =>
  Effect.gen(function* () {
    const skillsDir = yield* context.agent.resolveEffectiveSkillsDir({
      workspaceRoot: context.workspaceRoot,
    });
    if (skillsDir._tag !== "supported") return NO_PATHS;
    return yield* cleanupSkillArtifactsInDir({
      fs: context.fs,
      path: context.path,
      baseDir: context.workspaceRoot,
      skillsDir: skillsDir.dir,
    });
  });

const cleanupAgentCommands: RemovedAgentCleanup = (context) =>
  Effect.gen(function* () {
    const commandsDir = yield* context.agent.resolveEffectiveCommandsDir({
      workspaceRoot: context.workspaceRoot,
      scope: context.scope,
    });
    if (commandsDir._tag !== "supported") return NO_PATHS;
    return yield* cleanupCommandArtifactsInDir({
      fs: context.fs,
      path: context.path,
      commandsDir: commandsDir.dir,
    });
  });

const cleanupAgentSubagents: RemovedAgentCleanup = (context) =>
  Effect.gen(function* () {
    const subagentsDir = yield* context.agent.resolveEffectiveSubagentsDir({
      workspaceRoot: context.workspaceRoot,
      scope: context.scope,
    });
    if (subagentsDir._tag !== "supported") return NO_PATHS;
    return yield* cleanupSubagentArtifactsInDir({
      fs: context.fs,
      path: context.path,
      subagentsDir: subagentsDir.dir,
    });
  });

/**
 * Drop every `x-axm`-tagged server from the agent's MCP config. An empty
 * declared set means "nothing should remain", so only managed entries go and
 * user-authored servers stay.
 */
const cleanupAgentMcpServers: RemovedAgentCleanup = (context) =>
  Effect.gen(function* () {
    const outcome = yield* pruneManagedMcpServersForAgent(context.agent.id, {
      workspaceRoot: context.workspaceRoot,
      declaredServerNames: new Set<string>(),
      scope: context.scope,
    });
    if (outcome._tag !== "success") return NO_PATHS;
    return (outcome.targets ?? []).map((target) => target.path);
  });

/**
 * Strip AXM-rendered hook groups from the agent's settings files. Edits go
 * through jsonc-parser so user-authored groups, comments, and formatting in
 * these user-owned files survive.
 */
const cleanupAgentHooks: RemovedAgentCleanup = (context) =>
  Effect.gen(function* () {
    const capabilityAgent = CAPABILITY_AGENTS.find(
      (candidate) => candidate.id === context.agent.id,
    );
    const writer = capabilityAgent?.capabilities.hook.axm.writer;
    if (writer === undefined || writer === null) return NO_PATHS;

    const removedPaths: Array<string> = [];
    const configFiles = writer.configFiles.filter(
      (file) => file.scope === "project" && file.format === "json",
    );
    for (const file of configFiles) {
      const configPath = context.path.resolve(context.workspaceRoot, file.path);
      const exists = yield* context.fs
        .exists(configPath)
        .pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) continue;

      const raw = yield* safeReadFileString(context.fs, configPath);
      const next = yield* stripManagedHooksFromJson(configPath, writer.settingsKey, raw);
      if (next === raw) continue;

      yield* context.fs.writeFileString(configPath, next).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to strip managed hooks from: ${configPath}`,
            cause: error,
          }),
        ),
      );
      removedPaths.push(configPath);
    }
    return removedPaths;
  });

/**
 * `files` extensions render to workspace paths rather than per-agent
 * directories, and `rule` extensions live in shared instruction files as
 * managed regions that other configured agents still read. Neither is keyed to
 * a single agent, so removing one agent must not delete them.
 */
const noAgentScopedArtifacts: RemovedAgentCleanup = () => Effect.succeed(NO_PATHS);

/**
 * Cleanup keyed by leaf extension type: adding a per-agent type to
 * `LEAF_EXTENSION_TYPES` fails to compile here until its removal behavior is
 * decided.
 */
const cleanupByExtensionType = {
  skill: cleanupAgentSkills,
  command: cleanupAgentCommands,
  subagent: cleanupAgentSubagents,
  "mcp-server": cleanupAgentMcpServers,
  hook: cleanupAgentHooks,
  files: noAgentScopedArtifacts,
  rule: noAgentScopedArtifacts,
} as const satisfies Record<LeafExtensionType, RemovedAgentCleanup>;

/**
 * Remove AXM-managed artifacts for agents that are no longer configured for a
 * workspace: rendered skill, command, and subagent files, plus the agent's
 * managed MCP server entries and hook groups. Only content carrying an
 * AXM-managed signal is removed; user-authored files and entries are left
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

      const context: RemovedAgentCleanupContext = {
        fs,
        path,
        agent,
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
      };
      for (const type of LEAF_EXTENSION_TYPES) {
        removedPaths.push(...(yield* cleanupByExtensionType[type](context)));
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
