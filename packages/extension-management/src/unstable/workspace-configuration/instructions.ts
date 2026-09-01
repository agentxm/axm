import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  insertManagedFileBanner,
  managedFileFormatForPath,
  managedFileMarker,
} from "../extensions/index.js";
import { isGitManaged } from "../git/detect.js";
import { type InstructionsConfig } from "@agentxm/workspace-state";
import { createSymlink } from "@agentxm/workspace-state";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import { AXM_DIR_NAME } from "@agentxm/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { protectWorkspacePath } from "@agentxm/workspace-state";
import { recordFootprint } from "@agentxm/workspace-state";
import { reconcilePatternList } from "../projection/adapters.js";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type {
  AgentDescriptor,
  AgentId,
  AgentInstructionsDescriptor,
} from "@agentxm/extension-model/unstable/agents/types";
import { toAppError } from "../app-error/conversions.js";

export interface ResolvedInstructionsConfig {
  readonly fileName: string;
  readonly gitignoreAliases: boolean;
}

/**
 * How AXM realizes an instruction target. `none` marks a configured agent
 * with no projectable convention, so nothing is written or inspected for it.
 */
export type InstructionMechanism = "native" | "symlink" | "copy" | "adapter" | "none";

export type InstructionHealth =
  "ok" | "missing-source" | "missing-target" | "drift" | "broken-link" | "unsupported" | "stale";

/**
 * Ownership of whatever occupies an instruction target path, proven by
 * inspection alone: a symlink that resolves to the canonical source, or an
 * `axm:file` banner. Nothing is remembered between commands. `unowned` is a
 * collision with content AXM did not produce; it is reported and never
 * modified.
 */
export type InstructionTargetOwnership = "absent" | "owned-current" | "owned-drift" | "unowned";

/** The form present at a target path — what is on disk, not what sync would choose. */
export type ObservedInstructionForm =
  "none" | "symlink" | "broken-link" | "copy" | "file" | "directory";

export interface InstructionStatusItem {
  readonly root: string;
  readonly agentId: AgentId;
  readonly agentName: string;
  readonly sourceFile: string;
  readonly targetFile: string;
  readonly mechanism: InstructionMechanism;
  readonly health: InstructionHealth;
  readonly ownership: InstructionTargetOwnership;
  readonly observedForm: ObservedInstructionForm;
  readonly details: string;
}

export interface InstructionsStatus {
  readonly enabled: boolean;
  readonly sourceFileName: string;
  readonly gitignoreAliases: boolean;
  readonly roots: ReadonlyArray<string>;
  /** Canonical source paths the plan expects but the workspace lacks. */
  readonly missingSources: ReadonlyArray<string>;
  /** One row per configured agent at every discovered root. */
  readonly items: ReadonlyArray<InstructionStatusItem>;
  /**
   * AXM-owned targets no current plan item desires — residue of a removed
   * source root, a removed agent, or a changed source filename. Always
   * `health: "stale"` and owned; unowned files outside the plan are not AXM's
   * concern and are never listed.
   */
  readonly staleTargets: ReadonlyArray<InstructionStatusItem>;
}

export interface InstructionsGitignoreStatus {
  readonly file: string;
  readonly present: boolean;
  readonly managed: boolean;
  readonly desired: boolean;
  readonly current: boolean;
  readonly trackedAliases: ReadonlyArray<string>;
}

export interface InstructionProjectionEffect {
  readonly path: string;
  readonly change: "created" | "updated" | "removed";
}

/**
 * One command-scoped observation of the instruction projection: the expected
 * plan plus the filesystem and Git facts read against it at one moment. Status,
 * lint, preflight, cleanup, and sync all consume this value instead of
 * rediscovering roots separately. It is plain data, not a cache or a service.
 */
export interface InstructionProjectionSnapshot {
  readonly plan: InstructionProjectionPlan;
  readonly symlinkSupported: boolean;
  readonly status: InstructionsStatus;
  readonly gitignore: InstructionsGitignoreStatus;
}

export interface InstructionsSyncResult {
  /**
   * Observed after the writes, never the pre-write snapshot — except for a dry
   * run, which mutates nothing and reports the observation it planned from.
   */
  readonly snapshot: InstructionProjectionSnapshot;
  readonly written: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
}

type ManagedGitignoreRegionState = "absent" | "complete" | "malformed" | "unsupported-version";

const DEFAULT_SOURCE_FILE = "AGENTS.md";
const DEFAULT_GITIGNORE = true;
const INSTRUCTION_ALIASES_OWNER = "@agentxm/instructions/aliases";
/** Ownership identity carried by every managed alias copy's `axm:file` banner. */
const INSTRUCTION_ALIAS_EXT = "@agentxm/instructions/alias";

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

export type InstructionTargetShape =
  | {
      readonly action: "native" | "write" | "adapter";
      readonly relativeTarget: string;
    }
  | { readonly action: "skip"; readonly reason: InstructionSkipReason };

export const resolveInstructionTargetShape = (args: {
  readonly instructions: AgentInstructionsDescriptor | undefined;
  readonly sourceFileName: string;
}): InstructionTargetShape => {
  const { instructions, sourceFileName } = args;
  if (instructions === undefined) {
    return { action: "skip", reason: "no-convention" };
  }
  switch (instructions.kind) {
    case "agents-md":
      return { action: "native", relativeTarget: sourceFileName };
    case "own-file":
      return instructions.file === sourceFileName
        ? { action: "native", relativeTarget: sourceFileName }
        : { action: "write", relativeTarget: instructions.file };
    case "rules-dir":
      return { action: "adapter", relativeTarget: instructions.dir };
  }
};

export const resolveInstructionTarget = (args: {
  readonly instructions: AgentInstructionsDescriptor | undefined;
  readonly sourceFileName: string;
  readonly symlinkSupported: boolean;
}): InstructionTargetResolution => {
  const { instructions, sourceFileName, symlinkSupported } = args;
  const shape = resolveInstructionTargetShape({ instructions, sourceFileName });
  if (shape.action === "skip") return shape;
  if (shape.action === "native") return { ...shape, mechanism: "native" };
  if (shape.action === "adapter") return { ...shape, mechanism: "adapter" };
  return { ...shape, mechanism: symlinkSupported ? "symlink" : "copy" };
};

const toInstructionHealth = (args: {
  readonly sourceExists: boolean;
  readonly mechanism: InstructionMechanism;
  readonly ownership: InstructionTargetOwnership;
  readonly observedForm: ObservedInstructionForm;
}): InstructionHealth => {
  if (!args.sourceExists) return "missing-source";
  if (args.mechanism === "adapter" || args.mechanism === "none") return "unsupported";
  if (args.observedForm === "broken-link") return "broken-link";
  if (args.observedForm === "none") return "missing-target";
  if (args.ownership === "owned-drift" || args.ownership === "unowned") return "drift";
  return "ok";
};

// -----------------------------------------------------------------------------
// Discovery — one tree walk yields the instruction roots and every path where
// a registry-known alias convention is present, configured or not.
// -----------------------------------------------------------------------------

const readDirSafe = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const empty: ReadonlyArray<string> = [];
    return yield* fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed(empty)));
  });

/**
 * A nested directory carrying its own `.git` entry is a separate working tree —
 * a registered worktree (`.git` file), a submodule, or a nested clone — and one
 * carrying its own `axm.json` is a separate AXM workspace. Their
 * instruction files belong to that tree, so propagation and cleanup stop at
 * the boundary rather than attributing the foreign tree's state to this
 * workspace or removing aliases it legitimately owns.
 *
 * The workspace root is visited directly and never tested, so a workspace that
 * is itself a repository still propagates normally.
 */
const isSeparateTree = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const has = (entry: string) =>
      fs.exists(path.join(dir, entry)).pipe(Effect.catch(() => Effect.succeed(false)));
    return (yield* has(".git")) || (yield* has(SETTINGS_FILENAME));
  });

/**
 * Directory symlinks are not entered: the linked tree is reachable under its
 * own path, and following the link would make the same files appear as two
 * roots and could carry the sweep outside the workspace.
 */
const isSymlink = (entry: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return Option.isSome(yield* fs.readLink(entry).pipe(Effect.option));
  });

interface OwnFileConvention {
  readonly agentId: AgentId;
  readonly agentName: string;
  readonly relativeTarget: string;
}

/**
 * Every own-file alias convention the compiled agent registry knows. Sweeping
 * these, rather than only the configured agents, is what lets cleanup find an
 * alias whose agent was removed from configuration without remembering
 * anything. A convention the registry no longer carries is not covered.
 */
const OWN_FILE_CONVENTIONS: ReadonlyArray<OwnFileConvention> = Object.values(AGENTS).flatMap(
  (descriptor) =>
    descriptor.instructions?.kind === "own-file"
      ? [
          {
            agentId: descriptor.id,
            agentName: descriptor.name,
            relativeTarget: descriptor.instructions.file,
          },
        ]
      : [],
);

/**
 * Leading directories of nested own-file conventions, such as `.junie`. They
 * are agent configuration, not project trees: an alias AXM writes there must
 * never be rediscovered as a canonical source of its own root. Their listings
 * are still swept for residue, so aliases an earlier discovery wrote inside
 * them remain removable.
 */
const AGENT_CONVENTION_DIRS: ReadonlySet<string> = new Set(
  OWN_FILE_CONVENTIONS.flatMap((convention) => {
    const [head, ...rest] = convention.relativeTarget.split("/");
    return head !== undefined && rest.length > 0 ? [head] : [];
  }),
);

const PROJECT_EXTENSION_ROOTS: ReadonlySet<string> = new Set([
  "agent_extensions",
  "skills",
  "mcps",
  "subagents",
  "rules",
  "hooks",
  "knowledge",
  "packs",
]);

const shouldSkipDir = (name: string, scope: WorkspaceScope): boolean =>
  name === ".git" ||
  name === ".axm" ||
  name === "node_modules" ||
  name === "dist" ||
  (scope === "project" && PROJECT_EXTENSION_ROOTS.has(name)) ||
  AGENT_CONVENTION_DIRS.has(name);

interface InstructionTargetCandidate extends OwnFileConvention {
  readonly root: string;
  readonly targetPath: string;
}

interface InstructionTree {
  readonly roots: ReadonlyArray<string>;
  readonly candidates: ReadonlyArray<InstructionTargetCandidate>;
}

const EMPTY_TREE: InstructionTree = { roots: [], candidates: [] };

/**
 * Whether `relativeTarget` names an entry below `dir`, including a broken
 * symlink. Directory listings decide presence rather than `exists`, so a
 * case-insensitive filesystem cannot present an authored `claude.md` as the
 * `CLAUDE.md` convention.
 */
const hasEntryAt = (args: {
  readonly dir: string;
  readonly entries: ReadonlyArray<string>;
  readonly relativeTarget: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const segments = args.relativeTarget.split("/");
    let current = args.dir;
    let entries = args.entries;
    for (const [index, segment] of segments.entries()) {
      if (!entries.includes(segment)) return false;
      if (index === segments.length - 1) return true;
      current = path.join(current, segment);
      entries = yield* readDirSafe(current);
    }
    return true;
  });

const discoverInstructionTree = (
  workspaceRoot: string,
  fileName: string,
  scope: WorkspaceScope,
): Effect.Effect<InstructionTree, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const candidatesIn = (dir: string, entries: ReadonlyArray<string>) =>
      Effect.forEach(
        // The canonical filename is a source wherever it appears, never an alias.
        OWN_FILE_CONVENTIONS.filter((convention) => convention.relativeTarget !== fileName),
        (convention) =>
          hasEntryAt({ dir, entries, relativeTarget: convention.relativeTarget }).pipe(
            Effect.map((present): ReadonlyArray<InstructionTargetCandidate> =>
              present
                ? [
                    {
                      ...convention,
                      root: dir,
                      targetPath: path.join(dir, convention.relativeTarget),
                    },
                  ]
                : [],
            ),
          ),
        { concurrency: 1 },
      ).pipe(Effect.map((found) => found.flat()));
    const visit = (
      dir: string,
    ): Effect.Effect<InstructionTree, never, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function* () {
        const entries = yield* readDirSafe(dir);
        const hasSource = entries.includes(fileName);
        const candidates = yield* candidatesIn(dir, entries);
        // A user workspace is the home directory for storage purposes, not a
        // project tree. Recursing from it can enter cloud-backed mounts and
        // hydrate files that have nothing to do with agent configuration.
        const children =
          scope === "user"
            ? []
            : yield* Effect.forEach(
                entries.filter(
                  (entry) => !shouldSkipDir(entry, scope) || AGENT_CONVENTION_DIRS.has(entry),
                ),
                (entry) =>
                  Effect.gen(function* () {
                    const full = path.join(dir, entry);
                    if (yield* isSymlink(full)) return EMPTY_TREE;
                    const stat = yield* fs.stat(full).pipe(Effect.option);
                    if (Option.isNone(stat) || stat.value.type !== "Directory") return EMPTY_TREE;
                    if (AGENT_CONVENTION_DIRS.has(entry)) {
                      return {
                        roots: [],
                        candidates: yield* candidatesIn(full, yield* readDirSafe(full)),
                      };
                    }
                    if (yield* isSeparateTree(full)) return EMPTY_TREE;
                    return yield* visit(full);
                  }),
                { concurrency: "unbounded" },
              );
        return {
          roots: [...(hasSource ? [dir] : []), ...children.flatMap((child) => child.roots)],
          candidates: [...candidates, ...children.flatMap((child) => child.candidates)],
        };
      });
    const tree = yield* visit(workspaceRoot);
    return {
      roots: tree.roots.length > 0 ? tree.roots : [workspaceRoot],
      candidates: tree.candidates,
    };
  });

let symlinkProbeSequence = 0;

export const probeSymlinkSupport = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = path.join(workspaceRoot, AXM_DIR_NAME, "tmp");
    const missingAncestors = (
      directory: string,
      missing: ReadonlyArray<string> = [],
    ): Effect.Effect<ReadonlyArray<string>> =>
      fs.exists(directory).pipe(
        Effect.catch(() => Effect.succeed(false)),
        Effect.flatMap((exists) => {
          if (exists) return Effect.succeed(missing);
          const parent = path.dirname(directory);
          return parent === directory
            ? Effect.succeed(missing)
            : missingAncestors(parent, [...missing, directory]);
        }),
      );
    const createdDirectories = yield* missingAncestors(tmpDir);
    yield* fs.makeDirectory(tmpDir, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    symlinkProbeSequence += 1;
    const probeDir = path.join(
      tmpDir,
      `instructions-symlink-probe-${process.pid.toString(36)}-${symlinkProbeSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const result = yield* Effect.gen(function* () {
      yield* fs.makeDirectory(probeDir, { recursive: true });
      const target = path.join(probeDir, "target");
      const link = path.join(probeDir, "link");
      yield* fs.writeFileString(target, "ok\n");
      yield* fs.symlink("target", link);
      const content = yield* fs.readFileString(link);
      return content === "ok\n";
    }).pipe(
      Effect.ensuring(fs.remove(probeDir, { recursive: true, force: true }).pipe(Effect.ignore)),
      Effect.catch(() => Effect.succeed(false)),
    );
    // Remove only empty directories the probe created, including newly created
    // user-workspace ancestors. Concurrently added content is preserved.
    yield* Effect.forEach(
      createdDirectories,
      (directory) =>
        fs.readDirectory(directory).pipe(
          Effect.flatMap((entries) =>
            entries.length === 0 ? fs.remove(directory, { recursive: true }) : Effect.void,
          ),
          Effect.catch(() => Effect.void),
        ),
      { concurrency: 1, discard: true },
    );
    return result;
  });

/**
 * Human-readable status line. Agents whose native convention AXM cannot write —
 * a rules directory it converts nothing into, or a secondary rules directory
 * beside the instruction file — say so explicitly, so "ok" is never claimed for
 * a location AXM never touched. An unowned collision names itself so the next
 * action is never guessed from a generic "needs attention".
 */
const instructionDetails = (
  descriptor: AgentInstructionsDescriptor,
  health: InstructionHealth,
  ownership: InstructionTargetOwnership,
): string => {
  if (descriptor.kind === "rules-dir") {
    return `Native rules directory ${descriptor.dir} is not yet synced by AXM.`;
  }
  const base =
    health === "ok"
      ? "Instruction file is current."
      : ownership === "unowned"
        ? "An unowned file occupies the instruction target; AXM will not modify it."
        : "Instruction file needs attention.";
  if (descriptor.rulesDir === undefined) return base;
  return `${base} Native rules directory ${descriptor.rulesDir} is not synced by AXM.`;
};

const STALE_TARGET_DETAILS =
  "AXM-owned instruction file is no longer desired by the current plan; sync removes it.";

const readFileOption = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(Effect.option);
  });

const isSamePath = (path: Path.Path, left: string, right: string): boolean =>
  path.resolve(left) === path.resolve(right);

const findAgentDescriptor = (agentId: string): AgentDescriptor | undefined =>
  Object.values(AGENTS).find((descriptor) => descriptor.id === agentId);

export type PlannedInstructionItem =
  | {
      readonly action: "skip";
      readonly reason: "unknown-agent";
      readonly root: string;
      readonly agentId: string;
      readonly agentName: string;
      readonly sourcePath: string;
    }
  | {
      readonly action: "skip";
      readonly reason: InstructionSkipReason;
      readonly root: string;
      readonly agentId: AgentId;
      readonly agentName: string;
      readonly sourcePath: string;
    }
  | {
      readonly action: "native" | "write" | "adapter";
      readonly root: string;
      readonly agentId: AgentId;
      readonly agentName: string;
      readonly sourcePath: string;
      readonly targetPath: string;
      readonly relativeTarget: string;
      readonly instructions: AgentInstructionsDescriptor;
    };

export interface InstructionProjectionPlan {
  readonly roots: ReadonlyArray<string>;
  readonly items: ReadonlyArray<PlannedInstructionItem>;
}

export const buildInstructionProjectionPlan = (args: {
  readonly roots: ReadonlyArray<string>;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly sourceFileName: string;
  readonly path: Path.Path;
}): InstructionProjectionPlan => ({
  roots: args.roots,
  items: args.roots.flatMap((root) => {
    const sourcePath = args.path.join(root, args.sourceFileName);
    return args.configuredAgents.map((agentId): PlannedInstructionItem => {
      const descriptor = findAgentDescriptor(agentId);
      if (descriptor === undefined) {
        return {
          action: "skip",
          reason: "unknown-agent",
          root,
          agentId,
          agentName: agentId,
          sourcePath,
        };
      }
      const instructions = descriptor.instructions;
      if (instructions === undefined) {
        return {
          action: "skip",
          reason: "no-convention",
          root,
          agentId: descriptor.id,
          agentName: descriptor.name,
          sourcePath,
        };
      }
      const shape = resolveInstructionTargetShape({
        instructions,
        sourceFileName: args.sourceFileName,
      });
      if (shape.action === "skip") {
        return { ...shape, root, agentId: descriptor.id, agentName: descriptor.name, sourcePath };
      }
      return {
        ...shape,
        root,
        agentId: descriptor.id,
        agentName: descriptor.name,
        sourcePath,
        targetPath: args.path.join(root, shape.relativeTarget),
        instructions,
      };
    });
  }),
});

// -----------------------------------------------------------------------------
// Observation — ownership is inspected, never remembered.
// -----------------------------------------------------------------------------

const fileExists = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
  });

const resolveLinkTarget = (path: Path.Path, linkPath: string, linkTarget: string): string =>
  path.resolve(path.dirname(linkPath), linkTarget);

const withManagedCopyBanner = (args: {
  readonly targetPath: string;
  readonly sourceFileName: string;
  readonly content: string;
}): string => {
  const format = managedFileFormatForPath(args.targetPath);
  if (format === undefined) return args.content;
  return insertManagedFileBanner(args.content, {
    source: { kind: "workspace-config", path: args.sourceFileName },
    helpTopic: "instructions",
    format,
    ext: INSTRUCTION_ALIAS_EXT,
  });
};

const managedCopyMarker = (args: { readonly targetPath: string; readonly content: string }) => {
  const format = managedFileFormatForPath(args.targetPath);
  return format === undefined ? Option.none() : managedFileMarker(args.content, format);
};

interface ObservedTargetPath {
  readonly ownership: InstructionTargetOwnership;
  readonly observedForm: ObservedInstructionForm;
}

const observed = (
  ownership: InstructionTargetOwnership,
  observedForm: ObservedInstructionForm,
): ObservedTargetPath => ({ ownership, observedForm });

/**
 * Classify what occupies a planned target path. Proof order: the path is the
 * source itself, a symlink resolving to the source, or a file carrying an
 * `axm:file` banner whose body is the source. Anything else present is
 * unowned. Any banner proves ownership here because the plan already names
 * this path as AXM's target; a drifted banner is rewritten, not disowned.
 */
const observeTargetPath = (args: {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceContent: Option.Option<string>;
  readonly sourceFileName: string;
}): Effect.Effect<ObservedTargetPath, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (isSamePath(path, args.sourcePath, args.targetPath)) {
      return observed("owned-current", Option.isSome(args.sourceContent) ? "file" : "none");
    }

    const linkTarget = yield* fs.readLink(args.targetPath).pipe(Effect.option);
    if (Option.isSome(linkTarget)) {
      const resolved = resolveLinkTarget(path, args.targetPath, linkTarget.value);
      const resolves = yield* fileExists(resolved);
      return observed(
        isSamePath(path, resolved, args.sourcePath) ? "owned-current" : "unowned",
        resolves ? "symlink" : "broken-link",
      );
    }

    const targetContent = yield* readFileOption(args.targetPath);
    if (Option.isNone(targetContent)) {
      const exists = yield* fs
        .exists(args.targetPath)
        .pipe(Effect.catch(() => Effect.succeed(true)));
      if (!exists) return observed("absent", "none");
      const stat = yield* fs.stat(args.targetPath).pipe(Effect.option);
      return observed(
        "unowned",
        Option.isSome(stat) && stat.value.type === "Directory" ? "directory" : "file",
      );
    }
    const marker = managedCopyMarker({ targetPath: args.targetPath, content: targetContent.value });
    if (Option.isNone(marker)) return observed("unowned", "file");
    if (Option.isNone(args.sourceContent)) return observed("owned-drift", "copy");
    return observed(
      withManagedCopyBanner({
        targetPath: args.targetPath,
        sourceFileName: args.sourceFileName,
        content: args.sourceContent.value,
      }) === targetContent.value
        ? "owned-current"
        : "owned-drift",
      "copy",
    );
  });

const observePlannedItems = (args: {
  readonly plan: InstructionProjectionPlan;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported: boolean;
}) =>
  Effect.forEach(
    args.plan.items,
    (item) =>
      Effect.gen(function* () {
        if (item.action === "skip") {
          return {
            root: item.root,
            agentId: item.reason === "unknown-agent" ? "universal" : item.agentId,
            agentName: item.agentName,
            sourceFile: item.sourcePath,
            targetFile: item.sourcePath,
            mechanism: "none",
            health: "unsupported",
            ownership: "absent",
            observedForm: "none",
            details:
              item.reason === "unknown-agent"
                ? "Unknown agent ID."
                : "Agent descriptor has no instruction-file convention.",
          } satisfies InstructionStatusItem;
        }
        const mechanism =
          item.action === "native"
            ? "native"
            : item.action === "adapter"
              ? "adapter"
              : resolveInstructionMechanism(item.instructions, args.symlinkSupported);
        const sourceContent = yield* readFileOption(item.sourcePath);
        // An adapter target is never written, so nothing there is AXM's to
        // own or collide with; only the source decides its health.
        const target =
          item.action === "adapter"
            ? observed("absent", "none")
            : yield* observeTargetPath({
                sourcePath: item.sourcePath,
                targetPath: item.targetPath,
                sourceContent,
                sourceFileName: args.config.fileName,
              });
        const health = toInstructionHealth({
          sourceExists: Option.isSome(sourceContent),
          mechanism,
          ...target,
        });
        return {
          root: item.root,
          agentId: item.agentId,
          agentName: item.agentName,
          sourceFile: item.sourcePath,
          targetFile: item.targetPath,
          mechanism,
          health,
          ownership: target.ownership,
          observedForm: target.observedForm,
          details: instructionDetails(item.instructions, health, target.ownership),
        } satisfies InstructionStatusItem;
      }),
    { concurrency: "unbounded" },
  );

/**
 * Classify a registry-convention path the current plan does not desire. Only
 * proof that AXM produced it makes it a stale target: a symlink that resolves
 * to the canonical file beside it — exactly what AXM writes — or a banner
 * carrying the instruction-alias identity. Anything else is not AXM's and is
 * left alone without being reported; outside the plan there is no collision.
 *
 * Aliases of an earlier canonical filename are not recognized here. That
 * transition runs through `axm instructions enable --file`, which removes the
 * previous configuration's owned aliases before the new plan is reconciled.
 */
const observeStaleCandidate = (
  candidate: InstructionTargetCandidate,
  sourceFileName: string,
): Effect.Effect<Option.Option<InstructionStatusItem>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stale = (fields: {
      readonly sourceFile: string;
      readonly mechanism: "symlink" | "copy";
      readonly ownership: "owned-current" | "owned-drift";
      readonly observedForm: "symlink" | "broken-link" | "copy";
    }): InstructionStatusItem => ({
      root: candidate.root,
      agentId: candidate.agentId,
      agentName: candidate.agentName,
      sourceFile: fields.sourceFile,
      targetFile: candidate.targetPath,
      mechanism: fields.mechanism,
      health: "stale",
      ownership: fields.ownership,
      observedForm: fields.observedForm,
      details: STALE_TARGET_DETAILS,
    });

    const linkTarget = yield* fs.readLink(candidate.targetPath).pipe(Effect.option);
    if (Option.isSome(linkTarget)) {
      const resolved = resolveLinkTarget(path, candidate.targetPath, linkTarget.value);
      if (!isSamePath(path, resolved, path.join(candidate.root, sourceFileName))) {
        return Option.none();
      }
      const resolves = yield* fileExists(resolved);
      return Option.some(
        stale({
          sourceFile: resolved,
          mechanism: "symlink",
          ownership: "owned-current",
          observedForm: resolves ? "symlink" : "broken-link",
        }),
      );
    }

    const content = yield* readFileOption(candidate.targetPath);
    if (Option.isNone(content)) return Option.none();
    const marker = managedCopyMarker({ targetPath: candidate.targetPath, content: content.value });
    if (Option.isNone(marker) || marker.value.ext !== INSTRUCTION_ALIAS_EXT) return Option.none();
    const sourceFile = path.join(candidate.root, marker.value.src);
    const sourceContent = yield* readFileOption(sourceFile);
    const current =
      Option.isSome(sourceContent) &&
      withManagedCopyBanner({
        targetPath: candidate.targetPath,
        sourceFileName: marker.value.src,
        content: sourceContent.value,
      }) === content.value;
    return Option.some(
      stale({
        sourceFile,
        mechanism: "copy",
        ownership: current ? "owned-current" : "owned-drift",
        observedForm: "copy",
      }),
    );
  });

const managedGitignoreRegionState = (content: string): ManagedGitignoreRegionState => {
  const reconciliation = reconcilePatternList({
    content,
    target: ".gitignore",
    region: "instruction-aliases",
    owner: INSTRUCTION_ALIASES_OWNER,
    patterns: [],
  });
  if (Option.isNone(reconciliation)) return "malformed";
  return reconciliation.value.state.state;
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

const workspaceRelativeGitPath = (args: {
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly targetPath: string;
}): string => {
  const relative = args.path.relative(args.workspaceRoot, args.targetPath);
  return args.path.sep === "/" ? relative : relative.split(args.path.sep).join("/");
};

const GITIGNORE_LITERAL_CHARACTERS = new Set(["\\", "*", "?", "[", "]", " "]);

const escapeGitignoreLiteral = (value: string): string =>
  [...value]
    .map((character) =>
      GITIGNORE_LITERAL_CHARACTERS.has(character) ? `\\${character}` : character,
    )
    .join("");

const desiredGitignorePatterns = (args: {
  readonly enabled: boolean;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly plan: InstructionProjectionPlan;
}): ReadonlyArray<string> =>
  args.enabled
    ? [
        ...new Set(
          args.plan.items.flatMap((item) =>
            item.action === "write"
              ? [
                  `/${escapeGitignoreLiteral(
                    workspaceRelativeGitPath({
                      path: args.path,
                      workspaceRoot: args.workspaceRoot,
                      targetPath: item.targetPath,
                    }),
                  )}`,
                ]
              : [],
          ),
        ),
      ].sort()
    : [];

const observeInstructionsGitignore = (args: {
  readonly workspaceRoot: string;
  readonly plan: InstructionProjectionPlan;
  readonly config: ResolvedInstructionsConfig;
  /** True only when the supplied filesystem is a snapshot of the Git index. */
  readonly gitIndexView: boolean;
}): Effect.Effect<InstructionsGitignoreStatus, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* instructionGitignorePath(args.workspaceRoot);
    const gitManaged = yield* isGitManaged(args.workspaceRoot);
    if (!gitManaged) {
      return {
        file,
        present: false,
        managed: false,
        desired: false,
        current: true,
        trackedAliases: [],
      };
    }

    const currentContent = yield* readFileOption(file);
    const writeTargets = args.plan.items
      .flatMap((item) =>
        item.action === "write"
          ? [
              {
                targetPath: item.targetPath,
                relativePath: workspaceRelativeGitPath({
                  path,
                  workspaceRoot: args.workspaceRoot,
                  targetPath: item.targetPath,
                }),
              },
            ]
          : [],
      )
      .filter(
        (target, index, targets) =>
          targets.findIndex((candidate) => candidate.targetPath === target.targetPath) === index,
      )
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const trackedAliases =
      args.config.gitignoreAliases && args.gitIndexView
        ? (yield* Effect.forEach(writeTargets, (target) =>
            fs.exists(target.targetPath).pipe(
              Effect.catch(() => Effect.succeed(false)),
              Effect.map((exists) => ({ ...target, exists })),
            ),
          ))
            .filter(({ exists }) => exists)
            .map(({ relativePath }) => relativePath)
        : [];
    const currentRegionState = Option.isSome(currentContent)
      ? managedGitignoreRegionState(currentContent.value)
      : "absent";
    const current = currentRegionState === "complete";
    const patterns = desiredGitignorePatterns({
      enabled: args.config.gitignoreAliases,
      path,
      workspaceRoot: args.workspaceRoot,
      plan: args.plan,
    });
    const desired = patterns.length > 0;
    const next = reconcileGitignorePatterns(
      Option.getOrElse(currentContent, () => ""),
      patterns,
    ).updated;
    return {
      file,
      present: Option.isSome(currentContent),
      managed: currentRegionState === "complete",
      desired,
      trackedAliases,
      current:
        currentRegionState !== "malformed" &&
        currentRegionState !== "unsupported-version" &&
        ((patterns.length === 0 && !current) ||
          (Option.isSome(currentContent) && currentContent.value === next)),
    };
  });

const uniqueEffects = (
  effects: ReadonlyArray<InstructionProjectionEffect>,
): ReadonlyArray<InstructionProjectionEffect> => {
  const byPath = new Map<string, InstructionProjectionEffect>();
  for (const effect of effects) byPath.set(effect.path, effect);
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

/** Exact durable paths a reconciliation from this observation will touch. */
export const instructionProjectionEffects = (
  snapshot: InstructionProjectionSnapshot,
): ReadonlyArray<InstructionProjectionEffect> =>
  uniqueEffects([
    ...snapshot.status.items.flatMap((item): ReadonlyArray<InstructionProjectionEffect> => {
      if (!isProjectedTarget(item) || item.health === "missing-source") return [];
      if (item.ownership === "unowned") return [];
      if (item.ownership === "owned-current" && item.observedForm !== "broken-link") return [];
      return [
        {
          path: item.targetFile,
          change: item.observedForm === "none" ? "created" : "updated",
        },
      ];
    }),
    ...snapshot.status.staleTargets.map((item) => ({
      path: item.targetFile,
      change: "removed" as const,
    })),
    ...(snapshot.gitignore.current
      ? []
      : [
          {
            path: snapshot.gitignore.file,
            change: snapshot.gitignore.present ? ("updated" as const) : ("created" as const),
          },
        ]),
  ]);

/** Exact durable paths disabling this observed projection will touch. */
export const instructionProjectionRemovalEffects = (
  snapshot: InstructionProjectionSnapshot,
): ReadonlyArray<InstructionProjectionEffect> =>
  uniqueEffects([
    ...snapshot.status.items.flatMap((item): ReadonlyArray<InstructionProjectionEffect> =>
      isProjectedTarget(item) &&
      item.ownership !== "absent" &&
      item.ownership !== "unowned" &&
      item.sourceFile !== item.targetFile
        ? [{ path: item.targetFile, change: "removed" }]
        : [],
    ),
    ...snapshot.status.staleTargets.map((item) => ({
      path: item.targetFile,
      change: "removed" as const,
    })),
    ...(snapshot.gitignore.managed
      ? [{ path: snapshot.gitignore.file, change: "updated" as const }]
      : []),
  ]);

export interface ObserveInstructionProjectionArgs {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported?: boolean;
  /** True only when the supplied filesystem is a snapshot of the Git index. */
  readonly gitIndexView?: boolean;
}

/**
 * Build the command-scoped snapshot: discover roots and alias candidates in
 * one walk, expand the plan, then read target, stale-candidate, and
 * `.gitignore` facts against it. Call it once per command and derive every
 * view from the result; call it again after writing to read the outcome back.
 */
export const observeInstructionProjection = (
  args: ObserveInstructionProjectionArgs,
): Effect.Effect<InstructionProjectionSnapshot, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const tree = yield* discoverInstructionTree(
      args.workspaceRoot,
      args.config.fileName,
      args.scope,
    );
    const plan = buildInstructionProjectionPlan({
      roots: tree.roots,
      configuredAgents: args.configuredAgents,
      sourceFileName: args.config.fileName,
      path,
    });
    const symlinkSupported =
      args.symlinkSupported ?? (yield* probeSymlinkSupport(args.workspaceRoot));
    const items = yield* observePlannedItems({ plan, config: args.config, symlinkSupported });
    const desiredTargets = new Set(
      plan.items.flatMap((item) => (item.action === "skip" ? [] : [path.resolve(item.targetPath)])),
    );
    // Candidates are only the alias names actually present at visited
    // directories — a handful in practice — so sequential classification adds
    // no fan-out beyond the walk and keeps the reported order deterministic.
    const staleTargets = (yield* Effect.forEach(
      tree.candidates.filter(
        (candidate) => !desiredTargets.has(path.resolve(candidate.targetPath)),
      ),
      (candidate) => observeStaleCandidate(candidate, args.config.fileName),
      { concurrency: 1 },
    ))
      .filter(Option.isSome)
      .map((item) => item.value);
    const missingSources = (yield* Effect.forEach(plan.roots, (root) =>
      fileExists(path.join(root, args.config.fileName)).pipe(
        Effect.map((exists) => (exists ? [] : [path.join(root, args.config.fileName)])),
      ),
    )).flat();
    const gitignore = yield* observeInstructionsGitignore({
      workspaceRoot: args.workspaceRoot,
      plan,
      config: args.config,
      gitIndexView: args.gitIndexView === true,
    });
    return {
      plan,
      symlinkSupported,
      status: {
        enabled: true,
        sourceFileName: args.config.fileName,
        gitignoreAliases: args.config.gitignoreAliases,
        roots: plan.roots,
        missingSources,
        items,
        staleTargets,
      },
      gitignore,
    };
  });

// -----------------------------------------------------------------------------
// Views over a snapshot — pure.
// -----------------------------------------------------------------------------

/** Rows whose target AXM writes: a distinct alias file realized by symlink or copy. */
const isProjectedTarget = (item: InstructionStatusItem): boolean =>
  item.mechanism === "symlink" || item.mechanism === "copy";

const unownedInstructionTargets = (
  status: InstructionsStatus,
): ReadonlyArray<InstructionStatusItem> =>
  status.items.filter((item) => isProjectedTarget(item) && item.ownership === "unowned");

/**
 * Whether every projected target with a canonical source is current, no owned
 * residue remains, and the managed `.gitignore` region matches. Rows whose
 * source is missing are not judged here: nothing can be written for them, and
 * the caller decides whether a missing canonical file is its concern — the
 * sync plan treats it as work, `axm lint --fix` leaves it to its author.
 */
export const instructionProjectionIsCurrent = (snapshot: InstructionProjectionSnapshot): boolean =>
  snapshot.status.items.every(
    (item) => !isProjectedTarget(item) || item.health === "ok" || item.health === "missing-source",
  ) &&
  snapshot.status.staleTargets.length === 0 &&
  snapshot.gitignore.current;

/**
 * The hard blocker every mutation shares: an unowned file at a planned target
 * stops the whole operation before any write, so no path can claim authority
 * over content AXM cannot prove it produced.
 */
export const assertInstructionTargetsSafe = (
  status: InstructionsStatus,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const blockers = unownedInstructionTargets(status);
    if (blockers.length === 0) return;
    return yield* makeAppError({
      code: "conflict",
      detail: `Instruction reconciliation would overwrite files with unknown ownership: ${blockers
        .map((item) => item.targetFile)
        .join(", ")}`,
      suggestions: [
        {
          description: "Inspect instruction-file ownership and drift",
          cmd: "axm instructions",
        },
      ],
    });
  });

// -----------------------------------------------------------------------------
// Mutation — decisions come from the snapshot; results come from reading back.
// -----------------------------------------------------------------------------

const writeFile = (filePath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const existed = yield* fs.exists(filePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect instruction file: ${filePath}`,
          cause: error,
        }),
      ),
    );
    yield* protectWorkspacePath(filePath).pipe(Effect.mapError(toAppError));
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
    yield* recordFootprint({ path: filePath, change: existed ? "modified" : "created" });
  });

const removeTargetFile = (targetPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* protectWorkspacePath(targetPath).pipe(Effect.mapError(toAppError));
    yield* fs.remove(targetPath, { force: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to remove managed instruction target: ${targetPath}`,
          cause,
        }),
      ),
    );
    yield* recordFootprint({ path: targetPath, change: "removed" });
  });

/**
 * Remove every target AXM owns — the current plan's owned aliases and all
 * stale residue — refusing the whole operation if any planned target is
 * unowned. Returns the removable paths in plan order; with `dryRun` nothing
 * is touched and the same list is returned.
 */
export const removeManagedInstructionTargets = (args: {
  readonly snapshot: InstructionProjectionSnapshot;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const { status } = args.snapshot;
    const blockers = unownedInstructionTargets(status);
    if (blockers.length > 0) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Instruction cleanup would remove files with unknown ownership: ${blockers
          .map((item) => item.targetFile)
          .join(", ")}`,
        suggestions: [
          {
            description: "Inspect instruction-file ownership and drift",
            cmd: "axm instructions",
          },
        ],
      });
    }
    const removable = [
      ...status.items.filter(
        (item) =>
          isProjectedTarget(item) &&
          (item.ownership === "owned-current" || item.ownership === "owned-drift") &&
          item.sourceFile !== item.targetFile,
      ),
      ...status.staleTargets,
    ].map((item) => item.targetFile);
    if (!args.dryRun) {
      yield* Effect.forEach(removable, removeTargetFile, { concurrency: 1, discard: true });
    }
    return removable;
  });

/**
 * Bring one projected target to its desired form. The snapshot row decides:
 * `unowned` is never touched; an `owned-current` target is accepted in
 * whichever form it has — a symlink that resolves to the source (writing
 * through it would overwrite the source) or a current copy — so a checkout
 * whose symlink support changes between runs never churns and status and sync
 * agree on what "current" means; everything else is (re)written.
 */
const syncOneTarget = (args: {
  readonly item: InstructionStatusItem;
  readonly sourceContent: string;
  readonly sourceFileName: string;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const { item } = args;
    if (item.ownership === "unowned") return Option.none<string>();
    if (item.ownership === "owned-current" && item.observedForm !== "broken-link") {
      return Option.none<string>();
    }
    if (args.dryRun) return Option.some(item.targetFile);
    if (item.mechanism === "symlink") {
      yield* createSymlink({ target: item.sourceFile, link: item.targetFile }).pipe(
        Effect.mapError(toAppError),
      );
      return Option.some(item.targetFile);
    }
    yield* writeFile(
      item.targetFile,
      withManagedCopyBanner({
        targetPath: item.targetFile,
        sourceFileName: args.sourceFileName,
        content: args.sourceContent,
      }),
    );
    return Option.some(item.targetFile);
  });

const writeGitignoreRegion = (args: {
  readonly workspaceRoot: string;
  readonly patterns: ReadonlyArray<string>;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const gitManaged = yield* isGitManaged(args.workspaceRoot);
    if (!gitManaged) return Option.none<string>();

    const filePath = yield* instructionGitignorePath(args.workspaceRoot);
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
    if (args.patterns.length === 0 && Option.isNone(current)) return Option.none<string>();
    if (args.patterns.length === 0 && Option.isSome(current) && !hasManagedRegion(current.value)) {
      return Option.none<string>();
    }
    const next = reconcileGitignorePatterns(
      Option.getOrElse(current, () => ""),
      args.patterns,
    ).updated;
    if (Option.isSome(current) && current.value === next) return Option.none<string>();
    if (!args.dryRun) yield* writeFile(filePath, next);
    return Option.some(filePath);
  });

export const removeInstructionsGitignore = (args: {
  readonly workspaceRoot: string;
  readonly dryRun: boolean;
}): Effect.Effect<Option.Option<string>, AppError, FileSystem.FileSystem | Path.Path> =>
  writeGitignoreRegion({
    workspaceRoot: args.workspaceRoot,
    patterns: [],
    dryRun: args.dryRun,
  });

/**
 * Apply the desired state the snapshot describes. Stale residue is removed
 * first, then targets are written, then the `.gitignore` region is rewritten —
 * an ignore entry is never dropped while the file it covers remains, so a
 * removed alias is not exposed to Git between steps.
 */
const applyInstructionProjection = (args: {
  readonly workspaceRoot: string;
  readonly config: ResolvedInstructionsConfig;
  readonly snapshot: InstructionProjectionSnapshot;
  readonly dryRun: boolean;
}): Effect.Effect<
  { readonly written: ReadonlyArray<string>; readonly removed: ReadonlyArray<string> },
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { snapshot } = args;
    const removed = snapshot.status.staleTargets.map((item) => item.targetFile);
    if (!args.dryRun) {
      yield* Effect.forEach(removed, removeTargetFile, { concurrency: 1, discard: true });
    }
    const writes = yield* Effect.forEach(
      snapshot.status.items.filter(isProjectedTarget),
      (item) =>
        Effect.gen(function* () {
          const sourceContent = yield* readFileOption(item.sourceFile);
          if (Option.isNone(sourceContent)) return Option.none<string>();
          return yield* syncOneTarget({
            item,
            sourceContent: sourceContent.value,
            sourceFileName: args.config.fileName,
            dryRun: args.dryRun,
          });
        }),
      { concurrency: "unbounded" },
    );
    const patterns = desiredGitignorePatterns({
      enabled: args.config.gitignoreAliases,
      path,
      workspaceRoot: args.workspaceRoot,
      plan: snapshot.plan,
    });
    const gitignoreWrite = yield* writeGitignoreRegion({
      workspaceRoot: args.workspaceRoot,
      patterns,
      dryRun: args.dryRun,
    });
    return {
      written: [
        ...writes.filter(Option.isSome).map((item) => item.value),
        ...Option.match(gitignoreWrite, { onNone: () => [], onSome: (value) => [value] }),
      ],
      removed,
    };
  });

const syncResult = (args: {
  readonly snapshot: InstructionProjectionSnapshot;
  readonly written: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
}): InstructionsSyncResult => ({
  snapshot: args.snapshot,
  written: args.written,
  removed: args.removed,
  skipped: args.snapshot.status.items
    .filter((item) => item.health !== "ok")
    .map((item) => item.targetFile),
});

export interface SyncInstructionsArgs extends ObserveInstructionProjectionArgs {
  readonly dryRun: boolean;
}

/**
 * Observe, apply, and read back. Unowned planned targets are skipped, not
 * failed; callers that must refuse on them run `assertInstructionTargetsSafe`
 * against their own snapshot first. A dry run returns the paths a real run
 * would write and remove and reports the pre-write observation unchanged.
 */
export const syncInstructions = (
  args: SyncInstructionsArgs,
): Effect.Effect<InstructionsSyncResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const snapshot = yield* observeInstructionProjection(args);
    const applied = yield* applyInstructionProjection({
      workspaceRoot: args.workspaceRoot,
      config: args.config,
      snapshot,
      dryRun: args.dryRun,
    });
    const observed = args.dryRun
      ? snapshot
      : yield* observeInstructionProjection({
          ...args,
          symlinkSupported: snapshot.symlinkSupported,
        });
    return syncResult({ snapshot: observed, ...applied });
  });

/**
 * The reconciliation `axm sync`, `axm lint --fix`, and instruction-file
 * transitions share: refuse on any unowned planned target or unsafe
 * `.gitignore` region before touching anything, apply the desired state, then
 * prove from a fresh observation that it was reached.
 */
export const reconcileInstructionTargets = (
  args: ObserveInstructionProjectionArgs,
): Effect.Effect<InstructionsSyncResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const snapshot = yield* observeInstructionProjection(args);
    yield* assertInstructionTargetsSafe(snapshot.status);
    yield* assertInstructionsGitignoreSafe(args.workspaceRoot);
    const applied = yield* applyInstructionProjection({
      workspaceRoot: args.workspaceRoot,
      config: args.config,
      snapshot,
      dryRun: false,
    });
    const after = yield* observeInstructionProjection({
      ...args,
      symlinkSupported: snapshot.symlinkSupported,
    });
    if (!instructionProjectionIsCurrent(after)) {
      return yield* makeAppError({
        code: "internal",
        detail: "Instruction reconciliation did not reach the desired state",
      });
    }
    return syncResult({ snapshot: after, ...applied });
  });
