import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  insertManagedFileBanner,
  managedFileFormatForPath,
  stripManagedFileBanner,
} from "../extensions/index.js";
import { isGitManaged } from "../git/detect.js";
import { type InstructionsConfig } from "../settings/index.js";
import { createSymlink } from "../utils/create-symlink.js";
import { AXM_DIR_NAME } from "../workspace/paths.js";
import type { WorkspaceScope } from "../workspace/scope.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { reconcilePatternList } from "../projection/adapters.js";
import { AGENTS } from "./registry.js";
import type { AgentDescriptor, AgentId, AgentInstructionsDescriptor } from "./types.js";

export interface ResolvedInstructionsConfig {
  readonly fileName: string;
  readonly gitignoreAliases: boolean;
}

export type InstructionMechanism = "native" | "symlink" | "copy" | "adapter";

export type InstructionHealth =
  "ok" | "missing-source" | "missing-target" | "drift" | "broken-link" | "unsupported";

export interface InstructionStatusItem {
  readonly root: string;
  readonly agentId: AgentId;
  readonly agentName: string;
  readonly sourceFile: string;
  readonly targetFile: string;
  readonly mechanism: InstructionMechanism;
  readonly health: InstructionHealth;
  readonly details: string;
}

export interface InstructionsStatus {
  readonly enabled: boolean;
  readonly sourceFileName: string;
  readonly gitignoreAliases: boolean;
  readonly roots: ReadonlyArray<string>;
  readonly items: ReadonlyArray<InstructionStatusItem>;
}

export interface InstructionsSyncResult {
  readonly status: InstructionsStatus;
  readonly written: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
}

type ManagedInstructionTargetState = "absent" | "owned-current" | "owned-drift" | "unowned";
type ManagedGitignoreRegionState = "absent" | "complete" | "malformed" | "unsupported-version";

export interface InstructionsGitignoreStatus {
  readonly file: string;
  readonly desired: boolean;
  readonly current: boolean;
  readonly trackedAliases: ReadonlyArray<string>;
}

const DEFAULT_SOURCE_FILE = "AGENTS.md";
const DEFAULT_GITIGNORE = true;
const INSTRUCTION_ALIASES_OWNER = "@agentxm/instructions/aliases";

export const resolveInstructionsConfig = (
  config: InstructionsConfig | undefined,
): ResolvedInstructionsConfig => ({
  fileName: config?.fileName ?? DEFAULT_SOURCE_FILE,
  gitignoreAliases: config?.gitignoreAliases ?? DEFAULT_GITIGNORE,
});

export const resolveInstructionMechanism = (
  descriptor: AgentInstructionsDescriptor,
  symlinkSupported: boolean,
): InstructionMechanism => {
  switch (descriptor.kind) {
    case "agents-md":
      return "native";
    case "own-file":
      if (symlinkSupported) return "symlink";
      return "copy";
    case "rules-dir":
      return "adapter";
  }
};

/** Reason an agent is excluded from instruction-file sync. */
export type InstructionSkipReason = "no-convention";

/**
 * A single, branch-exhaustive answer to the three questions both the sync
 * engine and the `axm setup` plan preview ask about a configured agent:
 * is it syncable, what file/dir does it target, and by what mechanism.
 *
 * `relativeTarget` is relative to an instruction root so this stays free of
 * the FileSystem/Path services and is trivially fixture-testable across the
 * whole registry. The `action` discriminant maps 1:1 to a plan-preview row:
 *
 * - `native`  — agent reads the source file itself (`AGENTS.md`); no write.
 * - `write`   — propagate the source to a distinct native file via symlink or
 *               copy (e.g. `CLAUDE.md`, `GEMINI.md`).
 * - `adapter` — convert the source into a native rules directory.
 * - `skip`    — agent has no encoded instruction-file convention.
 */
export type InstructionTargetResolution =
  | {
      readonly action: "native" | "write" | "adapter";
      readonly mechanism: InstructionMechanism;
      readonly relativeTarget: string;
    }
  | { readonly action: "skip"; readonly reason: InstructionSkipReason };

export const resolveInstructionTarget = (args: {
  readonly instructions: AgentInstructionsDescriptor | undefined;
  readonly sourceFileName: string;
  readonly symlinkSupported: boolean;
}): InstructionTargetResolution => {
  const { instructions, sourceFileName, symlinkSupported } = args;
  if (instructions === undefined) {
    return { action: "skip", reason: "no-convention" };
  }
  const mechanism = resolveInstructionMechanism(instructions, symlinkSupported);
  switch (instructions.kind) {
    case "agents-md":
      return { action: "native", mechanism, relativeTarget: sourceFileName };
    case "own-file":
      return { action: "write", mechanism, relativeTarget: instructions.file };
    case "rules-dir":
      return { action: "adapter", mechanism, relativeTarget: instructions.dir };
  }
};

export const normalizeMarkdownBody = (content: string): string => {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const body =
    lines[0] === "---"
      ? (() => {
          const end = lines.findIndex((line, index) => index > 0 && line === "---");
          return end > 0 ? lines.slice(end + 1) : lines;
        })()
      : lines;
  return body
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};

const normalizeInstructionFileBody = (content: string): string =>
  normalizeMarkdownBody(stripManagedFileBanner(content, "markdown"));

const toInstructionHealth = (args: {
  readonly sourceExists: boolean;
  readonly targetExists: boolean;
  readonly mechanism: InstructionMechanism;
  readonly drift: boolean;
  readonly brokenLink: boolean;
}): InstructionHealth => {
  if (!args.sourceExists) return "missing-source";
  if (args.mechanism === "adapter") return "unsupported";
  if (args.brokenLink) return "broken-link";
  if (!args.targetExists) return "missing-target";
  if (args.drift) return "drift";
  return "ok";
};

const shouldSkipDir = (name: string): boolean =>
  name === ".git" || name === ".axm" || name === "node_modules" || name === "dist";

const readDirSafe = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const empty: ReadonlyArray<string> = [];
    return yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed(empty)));
  });

export const findInstructionRoots = (
  workspaceRoot: string,
  fileName: string,
  scope: WorkspaceScope,
) =>
  Effect.gen(function* () {
    // A user workspace is the home directory for storage purposes, not a
    // project tree. Recursing from it can enter cloud-backed mounts and
    // hydrate files that have nothing to do with agent configuration.
    if (scope === "user") return [workspaceRoot];

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const visit = (
      dir: string,
    ): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function* () {
        const entries = yield* readDirSafe(dir);
        const hasSource = entries.includes(fileName);
        const childRoots = yield* Effect.forEach(
          entries.filter((entry) => !shouldSkipDir(entry)),
          (entry) =>
            Effect.gen(function* () {
              const full = path.join(dir, entry);
              const stat = yield* fs.stat(full).pipe(Effect.option);
              if (Option.isNone(stat) || stat.value.type !== "Directory") return [];
              return yield* visit(full);
            }),
          { concurrency: "unbounded" },
        );
        return [...(hasSource ? [dir] : []), ...childRoots.flat()];
      });
    const roots = yield* visit(workspaceRoot);
    return roots.length > 0 ? roots : [workspaceRoot];
  });

export const probeSymlinkSupport = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = path.join(workspaceRoot, AXM_DIR_NAME, "tmp");
    const probeDir = path.join(tmpDir, "instructions-symlink-probe");
    const target = path.join(probeDir, "target");
    const link = path.join(probeDir, "link");
    yield* fs.remove(probeDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    const result = yield* Effect.gen(function* () {
      yield* fs.makeDirectory(probeDir, { recursive: true });
      yield* fs.writeFileString(target, "ok\n");
      yield* fs.symlink("target", link);
      const content = yield* fs.readFileString(link);
      return content === "ok\n";
    }).pipe(Effect.catch(() => Effect.succeed(false)));
    yield* fs.remove(probeDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    // Remove the tmp dir only if the probe left it empty, so we don't strip out
    // unrelated content that another flow may have placed there.
    yield* fs.readDirectory(tmpDir).pipe(
      Effect.flatMap((entries) =>
        entries.length === 0 ? fs.remove(tmpDir, { recursive: true }) : Effect.void,
      ),
      Effect.catch(() => Effect.void),
    );
    return result;
  });

/**
 * Human-readable status line. Agents whose native convention AXM cannot write —
 * a rules directory it converts nothing into, or a secondary rules directory
 * beside the instruction file — say so explicitly, so "ok" is never claimed for
 * a location AXM never touched.
 */
const instructionDetails = (
  descriptor: AgentInstructionsDescriptor,
  health: InstructionHealth,
): string => {
  if (descriptor.kind === "rules-dir") {
    return `Native rules directory ${descriptor.dir} is not yet synced by AXM.`;
  }
  const base =
    health === "ok" ? "Instruction file is current." : "Instruction file needs attention.";
  if (descriptor.rulesDir === undefined) return base;
  return `${base} Native rules directory ${descriptor.rulesDir} is not synced by AXM.`;
};

const readFileOption = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(Effect.option);
  });

const isSamePath = (path: Path.Path, left: string, right: string): boolean =>
  path.resolve(left) === path.resolve(right);

const findAgentDescriptor = (agentId: string): AgentDescriptor | undefined =>
  Object.values(AGENTS).find((descriptor) => descriptor.id === agentId);

export const listInstructionAliases = (
  agents: ReadonlyArray<AgentDescriptor>,
  sourceFileName: string,
): ReadonlyArray<string> =>
  [
    ...new Set(
      agents.flatMap((agent) => {
        if (agent.instructions?.kind !== "own-file") return [];
        if (agent.instructions.file === sourceFileName) return [];
        return [agent.instructions.file];
      }),
    ),
  ].sort();

const findAgentDescriptors = (agentIds: ReadonlyArray<string>): ReadonlyArray<AgentDescriptor> =>
  agentIds.flatMap((agentId) => {
    const descriptor = findAgentDescriptor(agentId);
    return descriptor === undefined ? [] : [descriptor];
  });

const fileExists = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
  });

const targetForDescriptor = (
  root: string,
  sourceFile: string,
  descriptor: AgentInstructionsDescriptor,
  mechanism: InstructionMechanism,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolution = resolveInstructionTarget({
      instructions: descriptor,
      sourceFileName: sourceFile,
      symlinkSupported: mechanism === "symlink",
    });
    // `descriptor` is always defined here, so the resolution is never a skip.
    const relativeTarget = resolution.action === "skip" ? sourceFile : resolution.relativeTarget;
    return path.join(root, relativeTarget);
  });

const inspectTarget = (args: {
  readonly sourceContent: Option.Option<string>;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly mechanism: InstructionMechanism;
  readonly sourceFileName: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceExists = Option.isSome(args.sourceContent);
    const targetExists = yield* fileExists(args.targetPath);
    const linkTarget = yield* fs.readLink(args.targetPath).pipe(Effect.option);
    const brokenLink =
      Option.isSome(linkTarget) &&
      !(yield* fileExists(path.resolve(path.dirname(args.targetPath), linkTarget.value)));
    const state = yield* inspectManagedTargetState({
      sourcePath: args.sourcePath,
      targetPath: args.targetPath,
      sourceContent: args.sourceContent,
      sourceFileName: args.sourceFileName,
    });
    const drift = state === "owned-drift" || state === "unowned";
    return {
      sourceExists,
      targetExists,
      drift,
      brokenLink,
    };
  });

export const getInstructionsStatus = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported?: boolean;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* findInstructionRoots(args.workspaceRoot, args.config.fileName, args.scope);
    const symlinkSupported =
      args.symlinkSupported ?? (yield* probeSymlinkSupport(args.workspaceRoot));
    const items = yield* Effect.forEach(
      roots,
      (root) =>
        Effect.forEach(
          args.configuredAgents,
          (agentId) =>
            Effect.gen(function* () {
              const sourcePath = path.join(root, args.config.fileName);
              const descriptor = findAgentDescriptor(agentId);
              if (descriptor === undefined) {
                return {
                  root,
                  agentId: "universal",
                  agentName: agentId,
                  sourceFile: sourcePath,
                  targetFile: sourcePath,
                  mechanism: "copy",
                  health: "unsupported",
                  details: "Unknown agent ID.",
                } satisfies InstructionStatusItem;
              }
              if (descriptor.instructions === undefined) {
                return {
                  root,
                  agentId: descriptor.id,
                  agentName: descriptor.name,
                  sourceFile: sourcePath,
                  targetFile: sourcePath,
                  mechanism: "copy",
                  health: "unsupported",
                  details: "Agent descriptor has no instruction-file convention.",
                } satisfies InstructionStatusItem;
              }
              const mechanism = resolveInstructionMechanism(
                descriptor.instructions,
                symlinkSupported,
              );
              const targetPath = yield* targetForDescriptor(
                root,
                args.config.fileName,
                descriptor.instructions,
                mechanism,
              );
              const sourceContent = yield* readFileOption(sourcePath);
              const inspected = yield* inspectTarget({
                sourceContent,
                sourcePath,
                targetPath,
                mechanism,
                sourceFileName: args.config.fileName,
              });
              const health = toInstructionHealth({ ...inspected, mechanism });
              return {
                root,
                agentId: descriptor.id,
                agentName: descriptor.name,
                sourceFile: sourcePath,
                targetFile: targetPath,
                mechanism,
                health,
                details: instructionDetails(descriptor.instructions, health),
              } satisfies InstructionStatusItem;
            }),
          { concurrency: "unbounded" },
        ),
      { concurrency: "unbounded" },
    );
    return {
      enabled: true,
      sourceFileName: args.config.fileName,
      gitignoreAliases: args.config.gitignoreAliases,
      roots,
      items: items.flat(),
    } satisfies InstructionsStatus;
  });

const writeFile = (filePath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* protectWorkspacePath(filePath);
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create instruction-file directory: ${path.dirname(filePath)}`,
          cause: error,
        }),
      ),
    );
    yield* fs.writeFileString(filePath, content).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write instruction file: ${filePath}`,
          cause: error,
        }),
      ),
    );
  });

const canReplaceTarget = (args: {
  readonly force: boolean;
  readonly sourceContent: string;
  readonly targetContent: Option.Option<string>;
}): boolean =>
  args.force ||
  Option.isNone(args.targetContent) ||
  normalizeInstructionFileBody(args.sourceContent) ===
    normalizeInstructionFileBody(args.targetContent.value);

const withManagedCopyBanner = (args: {
  readonly targetPath: string;
  readonly sourceFileName: string;
  readonly content: string;
}): string => {
  const format = managedFileFormatForPath(args.targetPath);
  if (format === undefined) return args.content;
  return insertManagedFileBanner(args.content, {
    editPath: args.sourceFileName,
    helpTopic: "rules",
    format,
  });
};

const isManagedCopy = (args: {
  readonly targetPath: string;
  readonly sourceFileName: string;
  readonly content: string;
}): boolean => {
  const format = managedFileFormatForPath(args.targetPath);
  if (format === undefined) return false;
  const body = stripManagedFileBanner(args.content, format);
  return body !== args.content;
};

const inspectManagedTargetState = (args: {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceContent: Option.Option<string>;
  readonly sourceFileName: string;
}): Effect.Effect<ManagedInstructionTargetState, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state = (value: ManagedInstructionTargetState): ManagedInstructionTargetState => value;
    if (isSamePath(path, args.sourcePath, args.targetPath)) return state("owned-current");

    const linkTarget = yield* fs.readLink(args.targetPath).pipe(Effect.option);
    if (Option.isSome(linkTarget)) {
      return isSamePath(
        path,
        path.resolve(path.dirname(args.targetPath), linkTarget.value),
        args.sourcePath,
      )
        ? state("owned-current")
        : state("unowned");
    }

    const targetExists = yield* fs
      .exists(args.targetPath)
      .pipe(Effect.catch(() => Effect.succeed(true)));
    const targetContent = yield* readFileOption(args.targetPath);
    if (Option.isNone(targetContent)) {
      return state(targetExists ? "unowned" : "absent");
    }
    if (
      !isManagedCopy({
        targetPath: args.targetPath,
        sourceFileName: args.sourceFileName,
        content: targetContent.value,
      })
    ) {
      return state("unowned");
    }
    if (Option.isNone(args.sourceContent)) return state("owned-drift");
    return withManagedCopyBanner({
      targetPath: args.targetPath,
      sourceFileName: args.sourceFileName,
      content: args.sourceContent.value,
    }) === targetContent.value
      ? state("owned-current")
      : state("owned-drift");
  });

const managedTargetStates = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported?: boolean;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* findInstructionRoots(args.workspaceRoot, args.config.fileName, args.scope);
    const symlinkSupported =
      args.symlinkSupported ?? (yield* probeSymlinkSupport(args.workspaceRoot));
    return yield* Effect.forEach(
      roots,
      (root) =>
        Effect.gen(function* () {
          const sourcePath = path.join(root, args.config.fileName);
          const sourceContent = yield* readFileOption(sourcePath);
          return yield* Effect.forEach(
            args.configuredAgents,
            (agentId) =>
              Effect.gen(function* () {
                const descriptor = findAgentDescriptor(agentId);
                if (descriptor?.instructions === undefined) return Option.none();
                const mechanism = resolveInstructionMechanism(
                  descriptor.instructions,
                  symlinkSupported,
                );
                if (mechanism === "native" || mechanism === "adapter") return Option.none();
                const targetPath = yield* targetForDescriptor(
                  root,
                  args.config.fileName,
                  descriptor.instructions,
                  mechanism,
                );
                const state = yield* inspectManagedTargetState({
                  sourcePath,
                  targetPath,
                  sourceContent,
                  sourceFileName: args.config.fileName,
                });
                return Option.some({ sourcePath, targetPath, state });
              }),
            { concurrency: 1 },
          );
        }),
      { concurrency: 1 },
    ).pipe(
      Effect.map((nested) =>
        nested
          .flat()
          .filter(Option.isSome)
          .map((item) => item.value),
      ),
    );
  });

export const assertInstructionTargetsSafe = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported?: boolean;
}) =>
  Effect.gen(function* () {
    const states = yield* managedTargetStates(args);
    const blockers = states.filter((item) => item.state === "unowned");
    if (blockers.length === 0) return;
    return yield* makeAppError({
      code: "conflict",
      detail: `Instruction reconciliation would overwrite files with unknown ownership: ${blockers
        .map((item) => item.targetPath)
        .join(", ")}`,
      suggestions: [
        {
          description: "Inspect instruction-file ownership and drift",
          cmd: "axm instructions",
        },
      ],
    });
  });

export const removeManagedInstructionTargets = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly dryRun: boolean;
  readonly symlinkSupported?: boolean;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const states = yield* managedTargetStates(args);
    const blockers = states.filter((item) => item.state === "unowned");
    if (blockers.length > 0) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Instruction cleanup would remove files with unknown ownership: ${blockers
          .map((item) => item.targetPath)
          .join(", ")}`,
        suggestions: [
          {
            description: "Inspect instruction-file ownership and drift",
            cmd: "axm instructions",
          },
        ],
      });
    }
    const removable = states.filter(
      (item) =>
        (item.state === "owned-current" || item.state === "owned-drift") &&
        item.sourcePath !== item.targetPath,
    );
    if (!args.dryRun) {
      yield* Effect.forEach(
        removable,
        (item) =>
          protectWorkspacePath(item.targetPath).pipe(
            Effect.andThen(
              fs.remove(item.targetPath, { force: true }).pipe(
                Effect.mapError((cause) =>
                  makeAppError({
                    code: "internal",
                    detail: `Failed to remove managed instruction target: ${item.targetPath}`,
                    cause,
                  }),
                ),
              ),
            ),
          ),
        { concurrency: 1, discard: true },
      );
    }
    return removable.map((item) => item.targetPath);
  });

const syncOneTarget = (args: {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceContent: string;
  readonly mechanism: InstructionMechanism;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly sourceFileName: string;
}) =>
  Effect.gen(function* () {
    if (args.mechanism === "native" || args.mechanism === "adapter") return Option.none<string>();
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const linkTarget = yield* fs.readLink(args.targetPath).pipe(Effect.option);
    if (
      Option.isSome(linkTarget) &&
      isSamePath(
        path,
        path.resolve(path.dirname(args.targetPath), linkTarget.value),
        args.sourcePath,
      )
    ) {
      return Option.none<string>();
    }
    const targetContent = yield* readFileOption(args.targetPath);
    const targetExists = yield* fs
      .exists(args.targetPath)
      .pipe(Effect.catch(() => Effect.succeed(true)));
    if (Option.isNone(targetContent) && targetExists) return Option.none<string>();
    const state = yield* inspectManagedTargetState({
      sourcePath: args.sourcePath,
      targetPath: args.targetPath,
      sourceContent: Option.some(args.sourceContent),
      sourceFileName: args.sourceFileName,
    });
    if (state === "unowned" && !args.force) return Option.none<string>();
    const replace = canReplaceTarget({
      force: args.force,
      sourceContent: args.sourceContent,
      targetContent,
    });
    if (!replace) return Option.none<string>();
    if (args.dryRun) return Option.some(args.targetPath);
    if (args.mechanism === "symlink") {
      yield* createSymlink({ target: args.sourcePath, link: args.targetPath });
      return Option.some(args.targetPath);
    }
    const content = withManagedCopyBanner({
      targetPath: args.targetPath,
      sourceFileName: args.sourceFileName,
      content: args.sourceContent,
    });
    if (Option.isSome(targetContent) && targetContent.value === content) {
      return Option.none<string>();
    }
    yield* writeFile(args.targetPath, content);
    return Option.some(args.targetPath);
  });

const managedGitignoreRegionState = (content: string): ManagedGitignoreRegionState => {
  const reconciliation = reconcilePatternList({
    content,
    target: ".gitignore",
    region: "instruction-aliases",
    owner: INSTRUCTION_ALIASES_OWNER,
    patterns: [],
  });
  return Option.isSome(reconciliation) ? reconciliation.value.state.state : "malformed";
};

const hasManagedRegion = (content: string): boolean =>
  managedGitignoreRegionState(content) === "complete";

const reconcileGitignorePatterns = (content: string, patterns: ReadonlyArray<string>) =>
  Option.getOrThrowWith(
    reconcilePatternList({
      content,
      target: ".gitignore",
      region: "instruction-aliases",
      owner: INSTRUCTION_ALIASES_OWNER,
      patterns,
    }),
    () => new Error("Invariant: .gitignore must support hash comments"),
  );

const instructionGitignorePath = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(workspaceRoot, ".gitignore");
  });

export const assertInstructionsGitignoreSafe = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const filePath = yield* instructionGitignorePath(workspaceRoot);
    const current = yield* readFileOption(filePath);
    const state = Option.isSome(current) ? managedGitignoreRegionState(current.value) : "absent";
    if (state !== "malformed" && state !== "unsupported-version") {
      return;
    }
    return yield* makeAppError({
      code: "conflict",
      detail:
        state === "unsupported-version"
          ? `Instruction aliases use a newer AXM ownership marker; upgrade AXM before modifying ${filePath}`
          : `Instruction reconciliation found malformed AXM ownership markers: ${filePath}`,
      suggestions: [
        {
          description: "Inspect instruction-file ownership and drift",
          cmd: "axm instructions",
        },
      ],
    });
  });

const desiredGitignorePatterns = (args: {
  readonly desired: boolean;
  readonly sourceFileName: string;
  readonly configuredAgents: ReadonlyArray<string>;
}): ReadonlyArray<string> =>
  args.desired
    ? listInstructionAliases(findAgentDescriptors(args.configuredAgents), args.sourceFileName).map(
        (alias) => `**/${alias}`,
      )
    : [];

const writeGitignoreRegion = (args: {
  readonly workspaceRoot: string;
  readonly desired: boolean;
  readonly sourceFileName: string;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const gitManaged = yield* isGitManaged(args.workspaceRoot);
    if (!gitManaged) return Option.none<string>();

    const filePath = yield* instructionGitignorePath(args.workspaceRoot);
    const patterns = desiredGitignorePatterns({
      desired: args.desired,
      sourceFileName: args.sourceFileName,
      configuredAgents: args.configuredAgents,
    });
    const current = yield* readFileOption(filePath);
    const state = Option.isSome(current) ? managedGitignoreRegionState(current.value) : "absent";
    if (state === "malformed" || state === "unsupported-version") {
      return yield* makeAppError({
        code: "conflict",
        detail:
          state === "unsupported-version"
            ? `Instruction aliases use a newer AXM ownership marker; upgrade AXM before modifying ${filePath}`
            : `Instruction reconciliation found malformed AXM ownership markers: ${filePath}`,
        suggestions: [
          {
            description: "Inspect instruction-file ownership and drift",
            cmd: "axm instructions",
          },
        ],
      });
    }
    if (patterns.length === 0 && Option.isNone(current)) return Option.none<string>();
    if (patterns.length === 0 && Option.isSome(current) && !hasManagedRegion(current.value)) {
      return Option.none<string>();
    }
    const next = reconcileGitignorePatterns(
      Option.getOrElse(current, () => ""),
      patterns,
    ).updated;
    if (Option.isSome(current) && current.value === next) return Option.none<string>();
    if (!args.dryRun) yield* writeFile(filePath, next);
    return Option.some(filePath);
  });

export const getInstructionsGitignoreStatus = (args: {
  readonly workspaceRoot: string;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  /** True only when the supplied filesystem is a snapshot of the Git index. */
  readonly gitIndexView?: boolean;
}): Effect.Effect<InstructionsGitignoreStatus, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* instructionGitignorePath(args.workspaceRoot);
    const gitManaged = yield* isGitManaged(args.workspaceRoot);
    if (!gitManaged) {
      return {
        file,
        desired: false,
        current: true,
        trackedAliases: [],
      };
    }

    const currentContent = yield* readFileOption(file);
    const aliasNames = listInstructionAliases(
      findAgentDescriptors(args.configuredAgents),
      args.config.fileName,
    );
    const trackedAliases =
      args.config.gitignoreAliases && args.gitIndexView === true
        ? (yield* Effect.forEach(aliasNames, (alias) =>
            fs.exists(path.join(args.workspaceRoot, alias)).pipe(
              Effect.catch(() => Effect.succeed(false)),
              Effect.map((exists) => ({ alias, exists })),
            ),
          ))
            .filter(({ exists }) => exists)
            .map(({ alias }) => alias)
        : [];
    const currentRegionState = Option.isSome(currentContent)
      ? managedGitignoreRegionState(currentContent.value)
      : "absent";
    const current = currentRegionState === "complete";
    const patterns = desiredGitignorePatterns({
      desired: args.config.gitignoreAliases,
      sourceFileName: args.config.fileName,
      configuredAgents: args.configuredAgents,
    });
    const desired = patterns.length > 0;
    const next = reconcileGitignorePatterns(
      Option.getOrElse(currentContent, () => ""),
      patterns,
    ).updated;
    return {
      file,
      desired,
      trackedAliases,
      current:
        currentRegionState !== "malformed" &&
        currentRegionState !== "unsupported-version" &&
        ((patterns.length === 0 && !current) ||
          (Option.isSome(currentContent) && currentContent.value === next)),
    };
  });

export const syncInstructionTarget = (args: {
  readonly root: string;
  readonly agentId: string;
  readonly config: ResolvedInstructionsConfig;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly symlinkSupported?: boolean;
}): Effect.Effect<Option.Option<string>, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const descriptor = findAgentDescriptor(args.agentId);
    if (descriptor === undefined || descriptor.instructions === undefined) {
      return Option.none<string>();
    }
    const sourcePath = path.join(args.root, args.config.fileName);
    const sourceContent = yield* readFileOption(sourcePath);
    if (Option.isNone(sourceContent)) return Option.none<string>();
    const symlinkSupported = args.symlinkSupported ?? (yield* probeSymlinkSupport(args.root));
    const mechanism = resolveInstructionMechanism(descriptor.instructions, symlinkSupported);
    const targetPath = yield* targetForDescriptor(
      args.root,
      args.config.fileName,
      descriptor.instructions,
      mechanism,
    );
    return yield* syncOneTarget({
      sourcePath,
      targetPath,
      sourceContent: sourceContent.value,
      mechanism,
      force: args.force,
      dryRun: args.dryRun,
      sourceFileName: args.config.fileName,
    });
  });

export const syncInstructionsGitignore = (args: {
  readonly workspaceRoot: string;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly desired: boolean;
  readonly dryRun: boolean;
}): Effect.Effect<Option.Option<string>, AppError, FileSystem.FileSystem | Path.Path> =>
  writeGitignoreRegion({
    workspaceRoot: args.workspaceRoot,
    desired: args.desired,
    sourceFileName: args.config.fileName,
    configuredAgents: args.configuredAgents,
    dryRun: args.dryRun,
  });

export const syncInstructions = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly symlinkSupported?: boolean;
}): Effect.Effect<InstructionsSyncResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* findInstructionRoots(args.workspaceRoot, args.config.fileName, args.scope);
    const symlinkSupported =
      args.symlinkSupported ?? (yield* probeSymlinkSupport(args.workspaceRoot));
    const writtenNested = yield* Effect.forEach(
      roots,
      (root) =>
        Effect.gen(function* () {
          const sourcePath = path.join(root, args.config.fileName);
          const sourceContent = yield* readFileOption(sourcePath);
          if (Option.isNone(sourceContent)) return [];
          const writes = yield* Effect.forEach(
            args.configuredAgents,
            (agentId) =>
              Effect.gen(function* () {
                const descriptor = findAgentDescriptor(agentId);
                if (descriptor === undefined) return Option.none<string>();
                if (descriptor.instructions === undefined) return Option.none<string>();
                const mechanism = resolveInstructionMechanism(
                  descriptor.instructions,
                  symlinkSupported,
                );
                const targetPath = yield* targetForDescriptor(
                  root,
                  args.config.fileName,
                  descriptor.instructions,
                  mechanism,
                );
                return yield* syncOneTarget({
                  sourcePath,
                  targetPath,
                  sourceContent: sourceContent.value,
                  mechanism,
                  force: args.force,
                  dryRun: args.dryRun,
                  sourceFileName: args.config.fileName,
                });
              }),
            { concurrency: "unbounded" },
          );
          return writes.filter(Option.isSome).map((item) => item.value);
        }),
      { concurrency: "unbounded" },
    );
    const gitignoreWrite = yield* writeGitignoreRegion({
      workspaceRoot: args.workspaceRoot,
      desired: args.config.gitignoreAliases,
      sourceFileName: args.config.fileName,
      configuredAgents: args.configuredAgents,
      dryRun: args.dryRun,
    });
    const status = yield* getInstructionsStatus({
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
      configuredAgents: args.configuredAgents,
      config: args.config,
      symlinkSupported,
    });
    return {
      status,
      written: [
        ...writtenNested.flat(),
        ...Option.match(gitignoreWrite, { onNone: () => [], onSome: (value) => [value] }),
      ],
      skipped: status.items.filter((item) => item.health !== "ok").map((item) => item.targetFile),
    };
  });

export const reconcileInstructionTargets = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported?: boolean;
}): Effect.Effect<InstructionsSyncResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const result = yield* syncInstructions({
      ...args,
      force: true,
      dryRun: false,
    });
    const gitignore = yield* getInstructionsGitignoreStatus({
      workspaceRoot: args.workspaceRoot,
      configuredAgents: args.configuredAgents,
      config: args.config,
    });
    const targetsCurrent = result.status.items.every(
      (item) => (item.mechanism !== "symlink" && item.mechanism !== "copy") || item.health === "ok",
    );
    if (!targetsCurrent || !gitignore.current) {
      return yield* makeAppError({
        code: "internal",
        detail: "Instruction reconciliation did not reach the desired state",
      });
    }
    return result;
  });
