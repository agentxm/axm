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
import { PER_AGENT_EXTENSION_TYPES, type PerAgentType } from "../extensions/common.js";
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { hasManagedFileBanner } from "../extensions/managed-file-banner.js";
import { readAmbiguousHookCommands, stripManagedHooksFromJson } from "../hooks/managed-groups.js";
import type { WorkspaceScope } from "./scope.js";
import { WorkspaceMutations } from "./service-interface.js";
import { protectWorkspacePath } from "./transaction.js";

export interface RenderedFileCleanupResult {
  readonly removedPaths: ReadonlyArray<string>;
}

export interface RemovedAgentArtifactCleanupResult {
  readonly removedPaths: ReadonlyArray<string>;
  readonly preservedPaths: ReadonlyArray<string>;
}

export interface WorkspaceOwnershipIssue {
  readonly kind: "hook-ownership-ambiguous" | "managed-file-unowned";
  readonly path: string;
  readonly detail: string;
}

type RemovedAgentCleanupPaths = RemovedAgentArtifactCleanupResult;

const extensionNameFromFilename = (fileName: string): string => {
  const dotIndex = fileName.indexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
};

export const hasAxmManagedMarker = hasManagedFileBanner;

const isWithin = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const removePath = (
  fs: FileSystem.FileSystem,
  filePath: string,
  dryRun: boolean,
): Effect.Effect<void, AppError> =>
  dryRun
    ? Effect.void
    : protectWorkspacePath(filePath).pipe(
        Effect.andThen(fs.remove(filePath, { recursive: true })),
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
  readonly dryRun: boolean;
  readonly ownershipRoots?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const removedPaths: Array<string> = [];
    const preservedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(args.fs, args.skillsDir);
    const configuredRoots = args.ownershipRoots ?? [
      args.path.join(args.baseDir, REGISTRY_EXTENSIONS_DIR),
    ];
    const ownershipRoots = yield* Effect.forEach(configuredRoots, (root) =>
      args.fs.realPath(root).pipe(Effect.orElseSucceed(() => root)),
    );

    for (const entry of entries) {
      const artifactPath = args.path.join(args.skillsDir, entry);
      const linkTarget = yield* args.fs.readLink(artifactPath).pipe(Effect.option);
      if (linkTarget._tag === "Some") {
        const resolvedTarget = args.path.resolve(args.skillsDir, linkTarget.value);
        const canonicalTarget = yield* args.fs.realPath(resolvedTarget).pipe(Effect.option);
        const ownershipTarget =
          canonicalTarget._tag === "Some" ? canonicalTarget.value : resolvedTarget;
        if (!ownershipRoots.some((root) => isWithin(args.path, root, ownershipTarget))) {
          preservedPaths.push(artifactPath);
          continue;
        }
        yield* removePath(args.fs, artifactPath, args.dryRun);
        removedPaths.push(artifactPath);
        continue;
      }

      const stat = yield* args.fs.stat(artifactPath).pipe(Effect.option);
      if (stat._tag === "None") continue;
      if (stat.value.type !== "Directory") {
        preservedPaths.push(artifactPath);
        continue;
      }
      const managedCopy = yield* hasManagedSkillCopyMarker(args.fs, args.path, artifactPath);
      if (!managedCopy) {
        preservedPaths.push(artifactPath);
        continue;
      }
      yield* removePath(args.fs, artifactPath, args.dryRun);
      removedPaths.push(artifactPath);
    }

    return { removedPaths, preservedPaths } satisfies RemovedAgentCleanupPaths;
  });

const cleanupSubagentArtifactsInDir = (args: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly subagentsDir: string;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const removedPaths: Array<string> = [];
    const preservedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(args.fs, args.subagentsDir);

    for (const entry of entries) {
      const filePath = args.path.join(args.subagentsDir, entry);
      const stat = yield* args.fs.stat(filePath).pipe(Effect.option);
      if (stat._tag === "None" || stat.value.type !== "File") continue;
      const content = yield* safeReadFileString(args.fs, filePath);
      if (!hasAxmManagedMarker(content)) {
        preservedPaths.push(filePath);
        continue;
      }
      yield* removePath(args.fs, filePath, args.dryRun);
      removedPaths.push(filePath);
    }

    return { removedPaths, preservedPaths } satisfies RemovedAgentCleanupPaths;
  });

/** Discover one subagent's AXM-managed files without mutating the workspace. */
export const findManagedSubagentFiles = (subagentsDir: string, subagentName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const managedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(fs, subagentsDir);

    for (const entry of entries) {
      if (extensionNameFromFilename(entry) !== subagentName) continue;
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
  readonly skillOwnershipRoots: ReadonlyArray<string>;
  readonly dryRun: boolean;
}

type RemovedAgentCleanup = (
  context: RemovedAgentCleanupContext,
) => Effect.Effect<RemovedAgentCleanupPaths, AppError, FileSystem.FileSystem | Path.Path>;

const NO_PATHS: RemovedAgentCleanupPaths = { removedPaths: [], preservedPaths: [] };

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
      dryRun: context.dryRun,
      ownershipRoots: context.skillOwnershipRoots,
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
      dryRun: context.dryRun,
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
      dryRun: context.dryRun,
    });
    if (outcome._tag !== "success") return NO_PATHS;
    return {
      removedPaths: (outcome.targets ?? []).map((target) => target.path),
      preservedPaths: [],
    } satisfies RemovedAgentCleanupPaths;
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

      if (!context.dryRun) {
        yield* protectWorkspacePath(configPath);
        yield* context.fs.writeFileString(configPath, next).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to strip managed hooks from: ${configPath}`,
              cause: error,
            }),
          ),
        );
      }
      removedPaths.push(configPath);
    }
    return { removedPaths, preservedPaths: [] } satisfies RemovedAgentCleanupPaths;
  });

/**
 * Cleanup keyed on the placement axis: every extension type that renders into a
 * directory the agent owns needs removal behavior here, and adding a per-agent
 * type fails to compile until that behavior is decided.
 *
 * Workspace-placed types are deliberately absent rather than mapped to a no-op.
 * Workspace-placed extensions live in shared workspace content and are not
 * keyed to a single agent, so removing one agent must not delete them.
 */
const cleanupByExtensionType = {
  skill: cleanupAgentSkills,
  subagent: cleanupAgentSubagents,
  "mcp-server": cleanupAgentMcpServers,
  hook: cleanupAgentHooks,
} as const satisfies Record<PerAgentType, RemovedAgentCleanup>;

/**
 * Remove AXM-managed artifacts for agents that are no longer configured for a
 * workspace: rendered skill and subagent files, plus the agent's
 * managed MCP server entries and hook groups. Only content carrying an
 * AXM-managed signal is removed; user-authored files and entries are left
 * untouched.
 */
export const cleanupManagedArtifactsForRemovedAgents = (args: {
  readonly removedAgentIds: ReadonlySet<string>;
  readonly dryRun?: boolean;
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
    const preservedPaths: Array<string> = [];

    for (const agent of agents) {
      if (!args.removedAgentIds.has(agent.id)) continue;

      const context: RemovedAgentCleanupContext = {
        fs,
        path,
        agent,
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
        skillOwnershipRoots:
          ws.layout.scope === "project"
            ? [ws.layout.acquiredRoot, ws.layout.authoredRoot("skill")]
            : [ws.layout.canonicalRoot],
        dryRun: args.dryRun === true,
      };
      for (const type of PER_AGENT_EXTENSION_TYPES) {
        const result = yield* cleanupByExtensionType[type](context);
        removedPaths.push(...result.removedPaths);
        preservedPaths.push(...result.preservedPaths);
      }
    }

    return {
      removedPaths: [...new Set(removedPaths)],
      preservedPaths: [...new Set(preservedPaths)],
    };
  });

/** Inspect ownership proofs without mutating any agent-native artifact. */
export const inspectWorkspaceOwnership = (): Effect.Effect<
  ReadonlyArray<WorkspaceOwnershipIssue>,
  AppError,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const configured = new Set(yield* ws.getConfiguredAgents());
    const agents = yield* agentRepo.all;
    const issues: Array<WorkspaceOwnershipIssue> = [];
    for (const agent of agents) {
      if (!configured.has(agent.id)) continue;
      const skillsDir = yield* agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir });
      if (skillsDir._tag === "supported") {
        const result = yield* cleanupSkillArtifactsInDir({
          fs,
          path,
          baseDir: ws.baseDir,
          skillsDir: skillsDir.dir,
          dryRun: true,
          ownershipRoots:
            ws.layout.scope === "project"
              ? [ws.layout.acquiredRoot, ws.layout.authoredRoot("skill")]
              : [ws.layout.canonicalRoot],
        });
        issues.push(
          ...result.preservedPaths.map((artifactPath) => ({
            kind: "managed-file-unowned" as const,
            path: artifactPath,
            detail: "Agent skill artifact has no AXM symlink or structured file ownership proof.",
          })),
        );
      }
      const subagentsDir = yield* agent.resolveEffectiveSubagentsDir({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
      });
      if (subagentsDir._tag === "supported") {
        const result = yield* cleanupSubagentArtifactsInDir({
          fs,
          path,
          subagentsDir: subagentsDir.dir,
          dryRun: true,
        });
        issues.push(
          ...result.preservedPaths.map((artifactPath) => ({
            kind: "managed-file-unowned" as const,
            path: artifactPath,
            detail: "Agent subagent artifact has no structured file ownership proof.",
          })),
        );
      }
      const capabilityAgent = CAPABILITY_AGENTS.find((candidate) => candidate.id === agent.id);
      const writer = capabilityAgent?.capabilities.hook.axm.writer;
      if (writer === undefined || writer === null) continue;
      for (const file of writer.configFiles.filter(
        (candidate) => candidate.scope === ws.scope && candidate.format === "json",
      )) {
        const configPath = path.resolve(ws.baseDir, file.path);
        if (!(yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)))))
          continue;
        const raw = yield* safeReadFileString(fs, configPath);
        const commands = yield* readAmbiguousHookCommands(configPath, writer.settingsKey, raw);
        issues.push(
          ...commands.map((command) => ({
            kind: "hook-ownership-ambiguous" as const,
            path: configPath,
            detail: `Hook command targets an AXM canonical extension path without x-axm ownership metadata: ${command}`,
          })),
        );
      }
    }
    return issues.filter(
      (issue, index) =>
        issues.findIndex(
          (candidate) =>
            candidate.kind === issue.kind &&
            candidate.path === issue.path &&
            candidate.detail === issue.detail,
        ) === index,
    );
  });

export const cleanupStaleManagedSubagentFiles = (args: {
  readonly expectedSubagentNames: ReadonlySet<string>;
  readonly dryRun?: boolean;
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

        if (args.dryRun !== true) {
          yield* protectWorkspacePath(filePath);
          yield* fs.remove(filePath).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to remove stale managed subagent file: ${filePath}`,
                cause: error,
              }),
            ),
          );
        }
        removedPaths.push(filePath);
      }
    }

    return { removedPaths };
  });
