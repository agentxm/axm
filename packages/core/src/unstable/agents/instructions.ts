import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { type InstructionsConfig } from "../settings/index.js";
import { createSymlink } from "../utils/create-symlink.js";
import { AGENTS } from "./registry.js";
import type { AgentDescriptor, AgentId, AgentInstructionsDescriptor } from "./types.js";

export type InstructionGitignoreMode = "managed" | "local" | "off";

export interface ResolvedInstructionsConfig {
  readonly fileName: string;
  readonly gitignore: InstructionGitignoreMode;
}

export type InstructionMechanism = "native" | "symlink" | "pointer" | "copy" | "adapter";

export type InstructionHealth =
  | "ok"
  | "missing-source"
  | "missing-target"
  | "drift"
  | "broken-link"
  | "unsupported";

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
  readonly gitignore: InstructionGitignoreMode;
  readonly roots: ReadonlyArray<string>;
  readonly items: ReadonlyArray<InstructionStatusItem>;
}

export interface InstructionsSyncResult {
  readonly status: InstructionsStatus;
  readonly written: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
}

const DEFAULT_SOURCE_FILE = "AGENTS.md";
const DEFAULT_GITIGNORE: InstructionGitignoreMode = "off";
const START_MARKER = "# >>> axm:instructions >>>";
const END_MARKER = "# <<< axm:instructions <<<";

export const resolveInstructionsConfig = (
  config: InstructionsConfig | undefined,
): ResolvedInstructionsConfig => ({
  fileName: config?.fileName ?? DEFAULT_SOURCE_FILE,
  gitignore: config?.gitignore ?? DEFAULT_GITIGNORE,
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
      return descriptor.importSyntax === "at-path" ? "pointer" : "copy";
    case "rules-dir":
      return "adapter";
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

export const findInstructionRoots = (workspaceRoot: string, fileName: string) =>
  Effect.gen(function* () {
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
    const probeDir = path.join(workspaceRoot, ".axm", "tmp", "instructions-symlink-probe");
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
    return result;
  });

const readFileOption = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(Effect.option);
  });

const findAgentDescriptor = (agentId: string): AgentDescriptor | undefined =>
  Object.values(AGENTS).find((descriptor) => descriptor.id === agentId);

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
    switch (descriptor.kind) {
      case "agents-md":
        return path.join(root, sourceFile);
      case "own-file":
        return path.join(root, descriptor.file);
      case "rules-dir":
        return mechanism === "adapter"
          ? path.join(root, descriptor.dir)
          : path.join(root, sourceFile);
    }
  });

const pointerContent = (sourceFile: string): string => `@${sourceFile}\n`;

const inspectTarget = (args: {
  readonly sourcePath: string;
  readonly sourceContent: Option.Option<string>;
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
    const targetContent = yield* readFileOption(args.targetPath);
    const contentDrift =
      Option.isSome(args.sourceContent) &&
      Option.isSome(targetContent) &&
      normalizeMarkdownBody(args.sourceContent.value) !==
        normalizeMarkdownBody(targetContent.value);
    const pointerDrift =
      args.mechanism === "pointer" &&
      Option.isSome(targetContent) &&
      targetContent.value !== pointerContent(args.sourceFileName);
    const symlinkDrift =
      args.mechanism === "symlink" && targetExists && Option.isNone(linkTarget) && contentDrift;
    const drift = args.mechanism === "copy" ? contentDrift : pointerDrift || symlinkDrift;
    return {
      sourceExists,
      targetExists,
      drift,
      brokenLink,
    };
  });

export const getInstructionsStatus = (args: {
  readonly workspaceRoot: string;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* findInstructionRoots(args.workspaceRoot, args.config.fileName);
    const symlinkSupported = yield* probeSymlinkSupport(args.workspaceRoot);
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
                sourcePath,
                sourceContent,
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
                details:
                  health === "ok"
                    ? "Instruction file is current."
                    : "Instruction file needs attention.",
              } satisfies InstructionStatusItem;
            }),
          { concurrency: "unbounded" },
        ),
      { concurrency: "unbounded" },
    );
    return {
      enabled: true,
      sourceFileName: args.config.fileName,
      gitignore: args.config.gitignore,
      roots,
      items: items.flat(),
    } satisfies InstructionsStatus;
  });

const writeFile = (filePath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
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
  normalizeMarkdownBody(args.sourceContent) === normalizeMarkdownBody(args.targetContent.value);

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
    const targetContent = yield* readFileOption(args.targetPath);
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
    const content =
      args.mechanism === "pointer" ? pointerContent(args.sourceFileName) : args.sourceContent;
    yield* writeFile(args.targetPath, content);
    return Option.some(args.targetPath);
  });

const managedRegion = (patterns: ReadonlyArray<string>): string =>
  patterns.length === 0 ? "" : `${START_MARKER}\n${patterns.join("\n")}\n${END_MARKER}\n`;

const replaceManagedRegion = (content: string, region: string): string => {
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);
  if (start >= 0 && end >= start) {
    const after = end + END_MARKER.length;
    const prefix = content.slice(0, start).trimEnd();
    const suffix = content.slice(after).trimStart();
    return [prefix, region.trimEnd(), suffix].filter((part) => part !== "").join("\n\n") + "\n";
  }
  const prefix = content.trimEnd();
  return [prefix, region.trimEnd()].filter((part) => part !== "").join("\n\n") + "\n";
};

const gitignorePath = (workspaceRoot: string, mode: InstructionGitignoreMode) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return mode === "managed"
      ? path.join(workspaceRoot, ".gitignore")
      : path.join(workspaceRoot, ".git", "info", "exclude");
  });

const writeGitignoreRegion = (args: {
  readonly workspaceRoot: string;
  readonly mode: InstructionGitignoreMode;
  readonly sourceFileName: string;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    if (args.mode === "off") return Option.none<string>();
    const filePath = yield* gitignorePath(args.workspaceRoot, args.mode);
    const patterns = args.configuredAgents.flatMap((agentId) => {
      const descriptor = findAgentDescriptor(agentId);
      if (descriptor === undefined) return [];
      if (descriptor.instructions?.kind !== "own-file") return [];
      if (descriptor.instructions.file === args.sourceFileName) return [];
      return [`**/${descriptor.instructions.file}`];
    });
    const region = managedRegion([...new Set(patterns)].sort());
    const current = yield* readFileOption(filePath);
    const next = replaceManagedRegion(
      Option.getOrElse(current, () => ""),
      region,
    );
    if (Option.isSome(current) && current.value === next) return Option.none<string>();
    if (!args.dryRun) yield* writeFile(filePath, next);
    return Option.some(filePath);
  });

export const syncInstructions = (args: {
  readonly workspaceRoot: string;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly force: boolean;
  readonly dryRun: boolean;
}): Effect.Effect<InstructionsSyncResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* findInstructionRoots(args.workspaceRoot, args.config.fileName);
    const symlinkSupported = yield* probeSymlinkSupport(args.workspaceRoot);
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
      mode: args.config.gitignore,
      sourceFileName: args.config.fileName,
      configuredAgents: args.configuredAgents,
      dryRun: args.dryRun,
    });
    const status = yield* getInstructionsStatus({
      workspaceRoot: args.workspaceRoot,
      configuredAgents: args.configuredAgents,
      config: args.config,
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
