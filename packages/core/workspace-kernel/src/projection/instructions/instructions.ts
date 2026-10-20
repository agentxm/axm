import type {
  InstructionMechanism,
  InstructionHealth,
  InstructionTargetOwnership,
  ObservedInstructionForm,
  InstructionStatusItem,
} from "./instruction-status.js";
import { createHash } from "node:crypto";
import {
  instructionChangeLocations,
  observeInstructionNativeLocations,
} from "./native-outcomes.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { InstructionMaintenanceFailed, type InstructionMaintenanceFailure } from "./errors.js";
import {
  makeScannerFileSystem,
  ProjectionUnitPathSchema,
  type InstructionsConfig,
  type ProjectionDigest,
  type ProjectionRowChange,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
} from "../../workspace-state/index.js";
import { createSymlink } from "../../workspace-state/index.js";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import { DISCOVERY_SKIPPED_DIRECTORIES } from "@agentxm/extension-model/unstable/discovery-walk";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  protectWorkspacePath,
  protectCreatedAncestors,
  retireWorkspacePath,
  removeEmptyRuntimeDirectories,
} from "../../settlement/index.js";
import {
  assertNativeMutationWithin,
  assertNativeMutationWithinRoots,
  nativeAuthorityRoots,
  captureContainerIdentity,
  combineNativeLocationOutcomes,
  verifyContainerIdentity,
  deriveStructuralInverse,
  resolveNativeEntry,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
  isGitManaged,
} from "../../locations/index.js";
import { recordFootprint } from "../../settlement/index.js";
import {
  projectionGeneration,
  projectionIsCurrent,
  projectionOutputDigest,
} from "../generation.js";
import {
  decideWholeFileWrite,
  recordedOutputComparison,
  type WholeFileLastWrite,
} from "../whole-file-decision.js";
import { decideOutputDeletion, retainedOutputDetail } from "../deletion-guard.js";
import { scopeUnitPath } from "../unit-path.js";
import {
  ProjectionOutputPosture,
  REPLACE_UNRECORDED_FLAG,
  type ProjectionOutputPostureValue,
} from "../output-posture.js";
import {
  NativeWriteAuthority,
  reconcilePatternList,
  type ManagedRegionState,
} from "../../agent-adapters/index.js";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type {
  AgentDescriptor,
  MaterializationTargetId,
  AgentInstructionsDescriptor,
} from "@agentxm/extension-model/unstable/agents/types";
import { isRelativeWithin } from "@agentxm/host-primitives";

export interface ResolvedInstructionsConfig {
  readonly fileName: string;
  readonly gitignoreAliases: boolean;
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
  /**
   * How the alias region about to be rewritten compares with AXM's last write.
   * Absent unless a complete region is about to change.
   */
  readonly lastWrite?: "matches" | "modified" | "unrecorded";
}

export interface InstructionProjectionEffect {
  readonly path: string;
  readonly change: "created" | "updated" | "removed";
  /**
   * How the bytes this effect replaces compare with AXM's last write. Absent
   * when nothing is replaced or the target is a link.
   */
  readonly lastWrite?: "matches" | "modified" | "unrecorded";
}

/**
 * One command-scoped observation of the instruction projection: the expected
 * plan plus the filesystem and Git facts read against it at one moment. Status,
 * lint, preflight, cleanup, and sync all consume this value instead of
 * rediscovering roots separately. It is plain data, not a cache or a service.
 */
export interface InstructionProjectionSnapshot {
  readonly nativeRoots?: ReadonlyArray<string>;
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly eligibleAgentIds: ReadonlyArray<string>;
  readonly eligibleTargets?: ReadonlyArray<string>;
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
  readonly witnesses: ReadonlyArray<{
    readonly path: string;
    readonly anchor: string;
    readonly fingerprint: string;
  }>;
  readonly plan: InstructionProjectionPlan;
  readonly symlinkSupported: boolean;
  readonly status: InstructionsStatus;
  readonly gitignore: InstructionsGitignoreStatus;
  /** Recorded `instructions` projection rows the observation decided against. */
  readonly rows: InstructionProjectionRows;
  /** Recorded rows no planned or stale copy accounts for; reconciliation withdraws them. */
  readonly orphanRows: ReadonlyArray<ProjectionUnitPath>;
  /** Overwrite a differing file at a planned copy path that AXM has no record of writing. */
  readonly replaceUnrecorded: boolean;
  /** Delete recorded copies even when they were modified since AXM last wrote them. */
  readonly discardModified: boolean;
}

/** Recorded `instructions` projection rows, keyed by scope-relative path. */
export type InstructionProjectionRows = ReadonlyMap<ProjectionUnitPath, RecordedProjectionRow>;

/** A projected file a removal kept because AXM cannot show the bytes are its own. */
export interface RetainedInstructionTarget {
  readonly path: string;
  readonly reason: "modified" | "unrecorded";
}

export interface InstructionsSyncResult {
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
  /**
   * Observed after the writes, never the pre-write snapshot — except for a dry
   * run, which mutates nothing and reports the observation it planned from.
   */
  readonly snapshot: InstructionProjectionSnapshot;
  readonly written: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly retained: ReadonlyArray<RetainedInstructionTarget>;
  readonly skipped: ReadonlyArray<string>;
  /** Row edits the caller stages inside its accepted-resolution batch. */
  readonly rowChanges: ReadonlyArray<ProjectionRowChange>;
}

const DEFAULT_SOURCE_FILE = "AGENTS.md";
const DEFAULT_GITIGNORE = true;
const INSTRUCTIONS_KIND = "instructions";
const GITIGNORE_UNIT = ProjectionUnitPathSchema.make(".gitignore");

/** Apply staged row edits to a row map, for reading back after a write. */
export const withInstructionRowChanges = (
  rows: InstructionProjectionRows,
  changes: ReadonlyArray<ProjectionRowChange>,
): InstructionProjectionRows => {
  const next = new Map(rows);
  for (const change of changes) {
    if (change.kind !== INSTRUCTIONS_KIND) continue;
    if (change.row === undefined) next.delete(change.path);
    else next.set(change.path, { row: change.row, stale: change.row.gen === undefined });
  }
  return next;
};

const recordedRow = (
  rows: InstructionProjectionRows,
  unit: Option.Option<ProjectionUnitPath>,
): Option.Option<RecordedProjectionRow> =>
  Option.flatMap(unit, (key) => Option.fromNullishOr(rows.get(key)));

const withdrawRow = (path: ProjectionUnitPath): ProjectionRowChange => ({
  kind: INSTRUCTIONS_KIND,
  path,
  row: undefined,
});

/** Generation of one instruction copy: its path, its canonical source, and that source's bytes. */
const copyGeneration = (
  unit: ProjectionUnitPath,
  sourceFileName: string,
  sourceContent: string,
): ProjectionDigest => projectionGeneration([unit, sourceFileName, sourceContent]);

const gitignoreGeneration = (patterns: ReadonlyArray<string>): ProjectionDigest =>
  projectionGeneration([GITIGNORE_UNIT, ...patterns]);

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
type InstructionSkipReason = "no-convention" | "unverified-scope";

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
  readonly scope?: WorkspaceScope;
}): InstructionTargetShape => {
  const { instructions, sourceFileName } = args;
  if (instructions === undefined || !instructions.writerSupported)
    return { action: "skip", reason: "no-convention" };
  const scope = args.scope ?? "project";
  const primary = instructions.locations.find(
    (location) =>
      location.scope === scope &&
      location.role === "primary" &&
      location.applicability.kind === "always",
  );
  if (primary === undefined)
    return {
      action: "skip",
      reason: instructions.scopes.includes(scope) ? "unverified-scope" : "no-convention",
    };
  if (primary.shape === "directory") return { action: "adapter", relativeTarget: primary.path };
  return {
    action: primary.path === sourceFileName ? "native" : "write",
    relativeTarget: primary.path,
  };
};

export const resolveInstructionTarget = (args: {
  readonly instructions: AgentInstructionsDescriptor | undefined;
  readonly sourceFileName: string;
  readonly symlinkSupported: boolean;
  readonly scope?: WorkspaceScope;
}): InstructionTargetResolution => {
  const { instructions, sourceFileName, symlinkSupported } = args;
  const shape = resolveInstructionTargetShape({
    instructions,
    sourceFileName,
    ...(args.scope === undefined ? {} : { scope: args.scope }),
  });
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
  readonly declaration: AgentInstructionsDescriptor["locations"][number];
  readonly scope: WorkspaceScope;
  readonly agentId: MaterializationTargetId;
  readonly agentName: string;
  readonly relativeTarget: string;
}

/**
 * Every own-file alias convention the compiled agent registry knows. Sweeping
 * these, rather than only the configured agents, is what lets cleanup find an
 * alias whose agent was removed from configuration without remembering
 * anything. A convention the registry no longer carries is not covered.
 */
const OWN_FILE_CONVENTIONS: ReadonlyArray<OwnFileConvention> = Object.values(
  AGENT_DESCRIPTORS,
).flatMap((descriptor) =>
  (descriptor.instructions?.locations ?? [])
    .filter((location) => location.shape === "file" && location.applicability.kind === "always")
    .map((location) => ({
      agentId: descriptor.id,
      agentName: descriptor.name,
      relativeTarget: location.path,
      scope: location.scope,
      declaration: location,
    })),
);

/**
 * Leading directories of nested own-file conventions, such as `.junie`. They
 * are agent configuration, not project trees: an alias AXM writes there must
 * never be rediscovered as a canonical source of its own root. Their listings
 * are still swept for residue, so aliases an earlier discovery wrote inside
 * them remain removable.
 */
const AGENT_CONVENTION_DIRS: ReadonlySet<string> = new Set(
  OWN_FILE_CONVENTIONS.filter((convention) => convention.scope === "project").flatMap(
    (convention) => {
      const [head, ...rest] = convention.relativeTarget.split("/");
      return head !== undefined && rest.length > 0 ? [head] : [];
    },
  ),
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
  DISCOVERY_SKIPPED_DIRECTORIES.has(name) ||
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
    const segments = args.relativeTarget.split(path.sep === "\\" ? /[\\/]/ : "/");
    let current = args.dir;
    let entries = args.entries;
    for (const [index, segment] of segments.entries()) {
      if (!entries.includes(segment)) return false;
      if (index === segments.length - 1) return true;
      current = path.join(current, segment);
      const safe = yield* assertNativeMutationWithin(args.dir, current, "content").pipe(
        Effect.option,
      );
      if (Option.isNone(safe)) return false;
      entries = yield* readDirSafe(current);
    }
    return true;
  });

const discoverInstructionTree = (
  workspaceRoot: string,
  fileName: string,
  scope: WorkspaceScope,
  nativeDirectoryInputs?: NativeDirectoryInputs,
): Effect.Effect<InstructionTree, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* makeScannerFileSystem(yield* FileSystem.FileSystem);
    const path = yield* Path.Path;
    const declaredConventions = OWN_FILE_CONVENTIONS.flatMap((convention) => {
      const resolved = resolveNativeReadLocation(
        path,
        convention.agentId,
        convention.declaration,
        { workspaceRoot, scope },
        nativeDirectoryInputs ?? { skillsDirectoryOverrides: {} },
      );
      return resolved === undefined
        ? []
        : [
            {
              ...convention,
              targetPath: resolved.path,
              relativeTarget: path.relative(workspaceRoot, resolved.path),
            },
          ];
    });
    const conventions = declaredConventions.filter(
      (convention) =>
        convention.relativeTarget !== fileName && isRelativeWithin(path, convention.relativeTarget),
    );
    const candidatesIn = (dir: string, entries: ReadonlyArray<string>) =>
      Effect.forEach(
        // The canonical filename is a source wherever it appears, never an alias.
        conventions,
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
        const hasSource = yield* hasEntryAt({ dir, entries, relativeTarget: fileName });
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
                { concurrency: 16 },
              );
        return {
          roots: [...(hasSource ? [dir] : []), ...children.flatMap((child) => child.roots)],
          candidates: [...candidates, ...children.flatMap((child) => child.candidates)],
        };
      });
    const tree = yield* visit(workspaceRoot).pipe(Effect.provideService(FileSystem.FileSystem, fs));
    const allowedRoots = nativeAuthorityRoots(
      path,
      { workspaceRoot, scope },
      nativeDirectoryInputs ?? { skillsDirectoryOverrides: {} },
    );
    const externalCandidates =
      scope === "project"
        ? []
        : (yield* Effect.forEach(
            declaredConventions.filter((convention) =>
              convention.relativeTarget.startsWith(`..${path.sep}`),
            ),
            (convention) =>
              assertNativeMutationWithinRoots(
                allowedRoots,
                convention.targetPath,
                "entry",
                workspaceRoot,
              ).pipe(
                Effect.map(({ address }): ReadonlyArray<InstructionTargetCandidate> =>
                  address.kind === "absent" ? [] : [{ ...convention, root: workspaceRoot }],
                ),
                Effect.catch(() => Effect.succeed<ReadonlyArray<InstructionTargetCandidate>>([])),
              ),
          )).flat();
    return {
      roots: tree.roots,
      candidates: [...tree.candidates, ...externalCandidates],
    };
  });

export const probeSymlinkSupport = (workspaceRoot: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* assertNativeMutationWithin(workspaceRoot, workspaceRoot, "content");
      if (root.referentPath === undefined) return false;
      // Each probe owns one child of the existing native root. Shared scratch
      // parents cannot be retired by the creator while another probe uses them.
      const directoryIdentity = yield* Effect.acquireRelease(
        Effect.flatMap(
          fs.makeTempDirectory({
            directory: root.referentPath,
            prefix: ".axm-instructions-symlink-probe-",
          }),
          (target) => captureContainerIdentity({ nativeRoot: workspaceRoot, target }),
        ),
        (identity) => removeEmptyRuntimeDirectories([identity]),
      );
      const probeDir = directoryIdentity.physicalPath;
      const target = path.join(probeDir, "target");
      const link = path.join(probeDir, "link");
      yield* Effect.acquireRelease(
        Effect.gen(function* () {
          yield* fs.writeFileString(target, "ok\n");
          return yield* captureContainerIdentity({ nativeRoot: workspaceRoot, target });
        }),
        (identity) =>
          Effect.gen(function* () {
            if (
              (yield* verifyContainerIdentity(identity, { nativeRoot: workspaceRoot, target })) &&
              (yield* fs.readFileString(target)) === "ok\n"
            )
              yield* fs.remove(target);
          }).pipe(Effect.ignore),
      );
      yield* Effect.acquireRelease(fs.symlink("target", link), () =>
        Effect.gen(function* () {
          if ((yield* fs.readLink(link)) === "target") yield* fs.remove(link);
        }).pipe(Effect.ignore),
      );
      return (yield* fs.readFileString(link)) === "ok\n";
    }),
  ).pipe(Effect.catch(() => Effect.succeed(false)));

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
    return "The declared native rules directory is not yet synced by AXM.";
  }
  const base =
    health === "ok"
      ? "Instruction file is current."
      : ownership === "unowned"
        ? "An unowned file occupies the instruction target; AXM will not modify it."
        : "Instruction file needs attention.";
  const secondary = descriptor.locations
    .filter((location) => location.role === "additional" && location.shape === "directory")
    .map((location) => location.path);
  return secondary.length === 0
    ? base
    : `${base} Native rules directories ${secondary.join(", ")} are not synced by AXM.`;
};

const STALE_TARGET_DETAILS =
  "AXM-owned instruction file is no longer desired by the current plan; sync removes it.";

const readFileOption = (
  filePath: string,
  workspaceRoot: string,
  nativeRoots: ReadonlyArray<string> = [workspaceRoot],
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const address = yield* assertNativeMutationWithinRoots(
      nativeRoots,
      filePath,
      "content",
      workspaceRoot,
    ).pipe(
      Effect.map((selected) => selected.address),
      Effect.option,
    );
    if (
      Option.isNone(address) ||
      address.value.kind === "absent" ||
      address.value.kind === "directory" ||
      address.value.referentPath === undefined
    )
      return Option.none<string>();
    return yield* fs.readFileString(address.value.referentPath).pipe(Effect.option);
  });

/** Ephemeral observation proof; only digests and filesystem identity cross planning. */
const instructionWitness = (
  workspaceRoot: string,
  target: string,
  observedAnchor?: string,
  nativeRoots: ReadonlyArray<string> = [workspaceRoot],
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { address, nativeRoot } = yield* assertNativeMutationWithinRoots(
      nativeRoots,
      target,
      "entry",
      workspaceRoot,
    );
    let anchor = observedAnchor ?? path.dirname(address.entryPath);
    while (observedAnchor === undefined && !(yield* fs.exists(anchor))) {
      const parent = path.dirname(anchor);
      if (parent === anchor) return { anchor, fingerprint: "unreadable" };
      anchor = parent;
    }
    const parentIdentity = yield* captureContainerIdentity({
      nativeRoot: anchor,
      ownerRoot: workspaceRoot,
      target: anchor,
    });
    const identity =
      address.kind === "absent"
        ? Option.none()
        : yield* captureContainerIdentity({ nativeRoot, ownerRoot: workspaceRoot, target }).pipe(
            Effect.option,
          );
    const content =
      address.kind === "directory" || address.kind === "absent"
        ? Option.none<string>()
        : yield* readFileOption(target, workspaceRoot, nativeRoots);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          address,
          parentIdentity,
          identity,
          content: Option.map(content, (raw) => createHash("sha256").update(raw).digest("hex")),
        }),
      )
      .digest("hex");
    return { anchor, fingerprint };
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({ anchor: observedAnchor ?? workspaceRoot, fingerprint: "unreadable" }),
    ),
  );

const assertInstructionWitnesses = (
  snapshot: InstructionProjectionSnapshot,
  selected?: ReadonlySet<string>,
) =>
  Effect.gen(function* () {
    for (const witness of snapshot.witnesses) {
      if (selected !== undefined && !selected.has(witness.path)) continue;
      if (
        witness.fingerprint === "unreadable" ||
        (yield* instructionWitness(
          snapshot.workspaceRoot,
          witness.path,
          witness.anchor,
          snapshot.nativeRoots,
        )).fingerprint !== witness.fingerprint
      ) {
        return yield* new InstructionMaintenanceFailed({
          category: "conflict",
          detail: `Instruction input changed after observation: ${witness.path}`,
        });
      }
    }
  });

const instructionContentAddress = (workspaceRoot: string, target: string) =>
  assertNativeMutationWithin(workspaceRoot, target, "content").pipe(
    Effect.mapError(
      (cause) =>
        new InstructionMaintenanceFailed({
          category: "conflict",
          detail: `Instruction content leaves the selected workspace authority: ${target}`,
          cause,
        }),
    ),
  );

const isSamePath = (path: Path.Path, left: string, right: string): boolean =>
  path.resolve(left) === path.resolve(right);

const findAgentDescriptor = (agentId: string): AgentDescriptor | undefined =>
  Object.values(AGENT_DESCRIPTORS).find((descriptor) => descriptor.id === agentId);

type PlannedInstructionItem =
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
      readonly agentId: MaterializationTargetId;
      readonly agentName: string;
      readonly sourcePath: string;
    }
  | {
      readonly action: "native" | "write" | "adapter";
      readonly root: string;
      readonly agentId: MaterializationTargetId;
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
  readonly scope?: WorkspaceScope;
  readonly nativeDirectoryInputs?: NativeDirectoryInputs;
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
        scope: args.scope ?? "project",
      });
      if (shape.action === "skip") {
        return { ...shape, root, agentId: descriptor.id, agentName: descriptor.name, sourcePath };
      }
      const declaration = instructions.locations.find(
        (location) =>
          location.scope === (args.scope ?? "project") &&
          location.role === "primary" &&
          location.applicability.kind === "always",
      );
      const resolved =
        declaration === undefined
          ? undefined
          : resolveNativeReadLocation(
              args.path,
              descriptor.id,
              declaration,
              { workspaceRoot: root, scope: args.scope ?? "project" },
              args.nativeDirectoryInputs ?? { skillsDirectoryOverrides: {} },
            );
      if (resolved === undefined)
        return {
          action: "skip",
          reason: "unverified-scope",
          root,
          agentId: descriptor.id,
          agentName: descriptor.name,
          sourcePath,
        };
      return {
        ...shape,
        root,
        agentId: descriptor.id,
        agentName: descriptor.name,
        sourcePath,
        targetPath: resolved.path,
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

/**
 * An observed path's row key. Observation is total: a path that leaves, or
 * cannot be located beneath, the scope root has no key and so no recorded row.
 */
const observedUnitPath = (
  workspaceRoot: string,
  targetPath: string,
): Effect.Effect<Option.Option<ProjectionUnitPath>, never, FileSystem.FileSystem | Path.Path> =>
  scopeUnitPath(workspaceRoot, targetPath).pipe(Effect.catch(() => Effect.succeedNone));

interface ObservedTargetPath {
  readonly ownership: InstructionTargetOwnership;
  readonly observedForm: ObservedInstructionForm;
  readonly lastWrite?: WholeFileLastWrite;
}

const observed = (
  ownership: InstructionTargetOwnership,
  observedForm: ObservedInstructionForm,
): ObservedTargetPath => ({ ownership, observedForm });

/**
 * Classify what occupies a planned target path. The path is the source
 * itself, a symlink resolving to the source, or a file judged against its
 * recorded projection row by the shared whole-file decision. A differing file
 * AXM has no record of writing is unowned.
 */
const observeTargetPath = (args: {
  readonly nativeRoots?: ReadonlyArray<string>;
  readonly workspaceRoot: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceContent: Option.Option<string>;
  readonly sourceFileName: string;
  readonly rows: InstructionProjectionRows;
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
      const direct = yield* resolveNativeEntry(resolved).pipe(Effect.option);
      const source = yield* resolveNativeEntry(args.sourcePath).pipe(Effect.option);
      return observed(
        Option.isSome(direct) &&
          Option.isSome(source) &&
          direct.value.kind !== "symlink" &&
          direct.value.entryPath === source.value.entryPath
          ? "owned-current"
          : "unowned",
        resolves ? "symlink" : "broken-link",
      );
    }

    const targetContent = yield* readFileOption(
      args.targetPath,
      args.workspaceRoot,
      args.nativeRoots,
    );
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
    const unit = yield* observedUnitPath(args.workspaceRoot, args.targetPath);
    const recorded = recordedRow(args.rows, unit);
    if (Option.isNone(args.sourceContent) || Option.isNone(unit))
      // Without a source only AXM's last write can show the copy is unedited,
      // the same evidence the deletion guard uses.
      return Option.isSome(recorded)
        ? {
            ...observed("owned-drift", "copy"),
            lastWrite:
              projectionOutputDigest(targetContent.value) === recorded.value.row.output
                ? "matches"
                : "modified",
          }
        : observed("unowned", "file");
    const decision = decideWholeFileWrite({
      recorded,
      gen: copyGeneration(unit.value, args.sourceFileName, args.sourceContent.value),
      bytes: targetContent,
      rendered: args.sourceContent.value,
      replaceUnrecorded: false,
    });
    switch (decision._tag) {
      case "current":
        // Kept for a rewrite a preceding source write forces in the same
        // operation; currency itself never reads these bytes.
        return Option.isSome(recorded)
          ? {
              ...observed("owned-current", "copy"),
              lastWrite: recordedOutputComparison(
                recorded.value,
                targetContent.value,
                args.sourceContent.value,
              ),
            }
          : observed("owned-current", "copy");
      case "write":
        return { ...observed("owned-drift", "copy"), lastWrite: decision.lastWrite };
      case "record":
        return observed("owned-unrecorded-identical", "copy");
      case "conflict":
        return { ...observed("unowned", "file"), lastWrite: "unrecorded" };
    }
  });

const observePlannedItems = (args: {
  readonly nativeRoots: ReadonlyArray<string>;
  readonly workspaceRoot: string;
  readonly plan: InstructionProjectionPlan;
  readonly config: ResolvedInstructionsConfig;
  readonly symlinkSupported: boolean;
  readonly rows: InstructionProjectionRows;
  readonly prospectiveRoots: ReadonlyArray<string>;
}) =>
  Effect.forEach(
    args.plan.items,
    (item) =>
      Effect.gen(function* () {
        if (item.action === "skip") {
          return Option.some({
            root: item.root,
            agentId: item.agentId,
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
                : item.reason === "unverified-scope"
                  ? "The native instruction location for this scope is unverified."
                  : "Agent descriptor has no instruction-file convention.",
          } satisfies InstructionStatusItem);
        }
        const mechanism =
          item.action === "native"
            ? "native"
            : item.action === "adapter"
              ? "adapter"
              : args.symlinkSupported
                ? "symlink"
                : "copy";
        const sourceContent = yield* readFileOption(
          item.sourcePath,
          args.workspaceRoot,
          args.nativeRoots,
        );
        // An adapter target is never written, so nothing there is AXM's to
        // own or collide with; only the source decides its health.
        const target =
          item.action === "adapter"
            ? observed("absent", "none")
            : yield* observeTargetPath({
                workspaceRoot: args.workspaceRoot,
                nativeRoots: args.nativeRoots,
                sourcePath: item.sourcePath,
                targetPath: item.targetPath,
                sourceContent,
                sourceFileName: args.config.fileName,
                rows: args.rows,
              });
        // No content authorizes creating or adopting a new empty alias. Use
        // this same source/target observation for the plan, status and apply.
        if (
          item.action === "write" &&
          Option.isSome(sourceContent) &&
          sourceContent.value.length === 0 &&
          !args.prospectiveRoots.includes(item.root) &&
          (target.ownership === "absent" || target.ownership === "owned-unrecorded-identical")
        )
          return Option.none<InstructionStatusItem>();
        const health = toInstructionHealth({
          sourceExists: Option.isSome(sourceContent),
          mechanism,
          ...target,
        });
        return Option.some({
          root: item.root,
          agentId: item.agentId,
          agentName: item.agentName,
          sourceFile: item.sourcePath,
          targetFile: item.targetPath,
          mechanism,
          health,
          ownership: target.ownership,
          observedForm: target.observedForm,
          ...(target.lastWrite === undefined ? {} : { lastWrite: target.lastWrite }),
          details: instructionDetails(item.instructions, health, target.ownership),
        } satisfies InstructionStatusItem);
      }),
    { concurrency: 16 },
  ).pipe(Effect.map((items) => items.filter(Option.isSome).map((item) => item.value)));

/**
 * Classify a registry-convention path the current plan does not desire. Only
 * evidence that AXM produced it makes it a stale target: a symlink that resolves
 * to the canonical file beside it — exactly what AXM writes — or a recorded
 * projection row at its path. Anything else is not AXM's and is left alone
 * without being reported; outside the plan there is no collision. A recorded
 * copy reads `owned-current` when the deletion guard would delete it and
 * `owned-drift` when it would be retained as modified.
 *
 * Aliases of an earlier canonical filename are not recognized here. That
 * transition runs through `axm instructions enable --file`, which removes the
 * previous configuration's owned aliases before the new plan is reconciled.
 */
const observeStaleCandidate = (
  candidate: InstructionTargetCandidate,
  sourceFileName: string,
  workspaceRoot: string,
  nativeRoots: ReadonlyArray<string>,
  rows: InstructionProjectionRows,
): Effect.Effect<Option.Option<InstructionStatusItem>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stale = (fields: {
      readonly sourceFile: string;
      readonly mechanism: "symlink" | "copy";
      readonly ownership: "owned-current" | "owned-drift";
      readonly observedForm: "symlink" | "broken-link" | "copy";
      readonly lastWrite?: "matches" | "modified";
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
      ...(fields.lastWrite === undefined ? {} : { lastWrite: fields.lastWrite }),
      details: STALE_TARGET_DETAILS,
    });

    const linkTarget = yield* fs.readLink(candidate.targetPath).pipe(Effect.option);
    if (Option.isSome(linkTarget)) {
      const resolved = resolveLinkTarget(path, candidate.targetPath, linkTarget.value);
      const direct = yield* resolveNativeEntry(resolved).pipe(Effect.option);
      const source = yield* resolveNativeEntry(path.join(candidate.root, sourceFileName)).pipe(
        Effect.option,
      );
      if (
        Option.isNone(direct) ||
        Option.isNone(source) ||
        direct.value.kind === "symlink" ||
        direct.value.entryPath !== source.value.entryPath
      ) {
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

    const content = yield* readFileOption(candidate.targetPath, workspaceRoot, nativeRoots);
    if (Option.isNone(content)) return Option.none();
    const recorded = recordedRow(
      rows,
      yield* observedUnitPath(workspaceRoot, candidate.targetPath),
    );
    if (Option.isNone(recorded)) return Option.none();
    const sourceFile = path.join(candidate.root, sourceFileName);
    const decision = decideOutputDeletion({
      bytes: content,
      recorded,
      expectedRender: yield* readFileOption(sourceFile, workspaceRoot, nativeRoots),
      discardModified: false,
    });
    return Option.some(
      stale({
        sourceFile,
        mechanism: "copy",
        ownership: decision._tag === "delete" ? "owned-current" : "owned-drift",
        observedForm: "copy",
        lastWrite: decision._tag === "delete" ? "matches" : "modified",
      }),
    );
  });

/** The alias region as found; `None` when its fences are malformed. */
const gitignoreRegion = (content: string): Option.Option<ManagedRegionState> =>
  Option.map(reconcilePatternList({ content, patterns: [] }), ({ state }) => state);

const managedGitignoreRegionState = (content: string): ManagedRegionState["state"] =>
  Option.match(gitignoreRegion(content), {
    onNone: () => "malformed",
    onSome: ({ state }) => state,
  });

/**
 * How the complete alias region in `content` compares with AXM's last write.
 * A body already equal to the new render also matches, so a merged lockfile
 * whose `output` lags never reports an unedited region as modified.
 */
const gitignoreLastWrite = (args: {
  readonly content: string;
  readonly patterns: ReadonlyArray<string>;
  readonly recorded: Option.Option<RecordedProjectionRow>;
}): Option.Option<"matches" | "modified" | "unrecorded"> =>
  Option.flatMap(
    reconcilePatternList({ content: args.content, patterns: args.patterns }),
    ({ state, writtenBody }) =>
      state.state === "complete"
        ? Option.some(
            Option.match(args.recorded, {
              onNone: () => "unrecorded" as const,
              onSome: ({ row }) =>
                projectionOutputDigest(state.body) === row.output || writtenBody === state.body
                  ? ("matches" as const)
                  : ("modified" as const),
            }),
          )
        : Option.none(),
  );

/** The `.gitignore` with the alias region rendered as `patterns`; `None` when it cannot be. */
const reconcileGitignorePatterns = (content: string, patterns: ReadonlyArray<string>) =>
  Option.map(reconcilePatternList({ content, patterns }), ({ updated }) => updated);

/** The row recording `raw`'s alias region, or its withdrawal once the region is gone. */
const gitignoreRowChange = (args: {
  readonly raw: string;
  readonly patterns: ReadonlyArray<string>;
  readonly recorded: Option.Option<RecordedProjectionRow>;
}): Option.Option<ProjectionRowChange> => {
  const region = gitignoreRegion(args.raw);
  if (Option.isSome(region) && region.value.state === "complete")
    return Option.some({
      kind: INSTRUCTIONS_KIND,
      path: GITIGNORE_UNIT,
      row: {
        gen: gitignoreGeneration(args.patterns),
        output: projectionOutputDigest(region.value.body),
      },
    });
  return Option.isSome(args.recorded) ? Option.some(withdrawRow(GITIGNORE_UNIT)) : Option.none();
};

const instructionGitignorePath = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(workspaceRoot, ".gitignore");
  });

const unsafeGitignoreRegionFailure = (filePath: string): InstructionMaintenanceFailed =>
  new InstructionMaintenanceFailed({
    category: "conflict",
    detail: `Instruction reconciliation found malformed AXM region fences: ${filePath}`,
    suggestions: [
      {
        description: "Inspect instruction-file ownership and drift",
        cmd: "axm instructions",
      },
    ],
  });

export const assertInstructionsGitignoreSafe = (workspaceRoot: string) =>
  Effect.gen(function* () {
    if (!(yield* isGitManaged(workspaceRoot))) return;
    const lexical = yield* instructionGitignorePath(workspaceRoot);
    const address = yield* instructionContentAddress(workspaceRoot, lexical);
    const filePath = address.referentPath ?? address.entryPath;
    const current = yield* readFileOption(filePath, workspaceRoot);
    const state = Option.isSome(current) ? managedGitignoreRegionState(current.value) : "absent";
    if (state !== "malformed") return;
    return yield* unsafeGitignoreRegionFailure(filePath);
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
  readonly rows: InstructionProjectionRows;
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

    const currentContent = yield* readFileOption(file, args.workspaceRoot);
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
    const complete = currentRegionState === "complete";
    const patterns = desiredGitignorePatterns({
      enabled: args.config.gitignoreAliases,
      path,
      workspaceRoot: args.workspaceRoot,
      plan: args.plan,
    });
    const desired = patterns.length > 0;
    const recorded = Option.fromNullishOr(args.rows.get(GITIGNORE_UNIT));
    // Currency is the recorded generation, never the region's bytes: a
    // reformatted region stays current until its patterns change.
    const current =
      currentRegionState !== "malformed" &&
      (desired
        ? projectionIsCurrent(recorded, gitignoreGeneration(patterns), complete)
        : currentRegionState === "absent");
    const lastWrite =
      current || Option.isNone(currentContent)
        ? Option.none()
        : gitignoreLastWrite({ content: currentContent.value, patterns, recorded });
    return {
      file,
      present: Option.isSome(currentContent),
      managed: complete,
      desired,
      trackedAliases,
      current,
      ...Option.match(lastWrite, { onNone: () => ({}), onSome: (value) => ({ lastWrite: value }) }),
    };
  });

const uniqueEffects = (
  effects: ReadonlyArray<InstructionProjectionEffect>,
): ReadonlyArray<InstructionProjectionEffect> => {
  const byPath = new Map<string, InstructionProjectionEffect>();
  for (const effect of effects) byPath.set(effect.path, effect);
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

export type PlannedInstructionChange =
  | {
      readonly kind: "target";
      readonly item: InstructionStatusItem;
      readonly change: "created" | "updated";
    }
  | { readonly kind: "stale"; readonly item: InstructionStatusItem; readonly change: "removed" }
  | {
      readonly kind: "owned-alias";
      readonly item: InstructionStatusItem;
      readonly change: "removed";
    }
  | { readonly kind: "gitignore"; readonly path: string; readonly change: "created" | "updated" }
  /** Unrecorded bytes already equal the source; only the projection row is written. */
  | { readonly kind: "record"; readonly item: InstructionStatusItem; readonly change: "recorded" };

/** A differing unrecorded file the caller explicitly asked AXM to overwrite. */
export const replaceableUnrecorded = (
  snapshot: Pick<InstructionProjectionSnapshot, "replaceUnrecorded">,
  item: InstructionStatusItem,
): boolean =>
  snapshot.replaceUnrecorded && item.ownership === "unowned" && item.observedForm === "file";

/** One decision for preview and apply; see docs/architecture/workspace/instruction-files.md:
 * a dry run names exactly the targets a real run would write and remove. */
const plannedInstructionChanges = (
  snapshot: InstructionProjectionSnapshot,
  mode: "reconcile" | "remove",
  /** Canonical physical paths and aliases a preceding region write will change. */
  sourceWrites: ReadonlyArray<string> = [],
): ReadonlyArray<PlannedInstructionChange> => {
  const stale: ReadonlyArray<PlannedInstructionChange> = snapshot.status.staleTargets.map(
    (item) => ({
      kind: "stale",
      item,
      change: "removed",
    }),
  );
  if (mode === "remove") {
    return [
      ...snapshot.status.items.flatMap((item): ReadonlyArray<PlannedInstructionChange> =>
        isProjectedTarget(item) &&
        (item.ownership === "owned-current" || item.ownership === "owned-drift") &&
        item.sourceFile !== item.targetFile
          ? [{ kind: "owned-alias", item, change: "removed" }]
          : [],
      ),
      ...stale,
      ...(snapshot.gitignore.managed
        ? [
            {
              kind: "gitignore" as const,
              path: snapshot.gitignore.file,
              change: "updated" as const,
            },
          ]
        : []),
    ];
  }
  return [
    ...stale,
    ...snapshot.status.items.flatMap((item): ReadonlyArray<PlannedInstructionChange> => {
      if (
        !isProjectedTarget(item) ||
        (item.health === "missing-source" && !sourceWrites.includes(item.sourceFile))
      )
        return [];
      if (item.ownership === "unowned" && !replaceableUnrecorded(snapshot, item)) return [];
      if (
        item.ownership === "owned-unrecorded-identical" &&
        !sourceWrites.includes(item.sourceFile)
      )
        return [{ kind: "record", item, change: "recorded" }];
      if (
        item.ownership === "owned-current" &&
        item.observedForm !== "broken-link" &&
        !(item.observedForm === "copy" && sourceWrites.includes(item.sourceFile))
      )
        return [];
      return [
        {
          kind: "target",
          item,
          change: item.observedForm === "none" ? "created" : "updated",
        },
      ];
    }),
    ...(snapshot.gitignore.current
      ? []
      : [
          {
            kind: "gitignore" as const,
            path: snapshot.gitignore.file,
            change: snapshot.gitignore.present ? ("updated" as const) : ("created" as const),
          },
        ]),
  ];
};

/**
 * A recorded copy edited since AXM wrote it is retained by the deletion guard,
 * not removed, unless the caller asked to discard modified output; only its
 * row is withdrawn.
 */
const retainedRemoval = (
  snapshot: Pick<InstructionProjectionSnapshot, "discardModified">,
  change: PlannedInstructionChange,
): boolean =>
  (change.kind === "stale" || change.kind === "owned-alias") &&
  change.item.lastWrite === "modified" &&
  !snapshot.discardModified;

/** The replaced-bytes comparison a preview reports; a created file replaces nothing. */
const effectLastWrite = (
  item: InstructionStatusItem,
  change: "created" | "updated" | "removed",
): Pick<InstructionProjectionEffect, "lastWrite"> =>
  change === "created" || item.lastWrite === undefined || item.lastWrite === "absent"
    ? {}
    : { lastWrite: item.lastWrite };

const instructionChangeEffect =
  (snapshot: Pick<InstructionProjectionSnapshot, "discardModified" | "gitignore">) =>
  (change: PlannedInstructionChange): ReadonlyArray<InstructionProjectionEffect> =>
    change.kind === "record" || retainedRemoval(snapshot, change)
      ? []
      : change.kind === "gitignore"
        ? [
            {
              path: change.path,
              change: change.change,
              ...(change.change === "created" || snapshot.gitignore.lastWrite === undefined
                ? {}
                : { lastWrite: snapshot.gitignore.lastWrite }),
            },
          ]
        : [
            {
              path: change.item.targetFile,
              change: change.change,
              ...effectLastWrite(change.item, change.change),
            },
          ];

/** Exact durable paths a reconciliation from this observation will touch. */
export const instructionProjectionEffects = (
  snapshot: InstructionProjectionSnapshot,
  sourceWrites: ReadonlyArray<string> = [],
): ReadonlyArray<InstructionProjectionEffect> =>
  uniqueEffects(
    plannedInstructionChanges(snapshot, "reconcile", sourceWrites).flatMap(
      instructionChangeEffect(snapshot),
    ),
  );

/**
 * Whether reconciling this observation changes recorded projection rows
 * without touching any native file: an identical copy to record, or a row
 * nothing accounts for any more.
 */
export const instructionProjectionRecordsRows = (
  snapshot: InstructionProjectionSnapshot,
): boolean =>
  snapshot.orphanRows.length > 0 ||
  plannedInstructionChanges(snapshot, "reconcile").some(
    (change) => change.kind === "record" || retainedRemoval(snapshot, change),
  );

/** Exact durable paths disabling this observed projection will touch. */
export const instructionProjectionRemovalEffects = (
  snapshot: InstructionProjectionSnapshot,
): ReadonlyArray<InstructionProjectionEffect> =>
  uniqueEffects(
    plannedInstructionChanges(snapshot, "remove").flatMap(instructionChangeEffect(snapshot)),
  );

export const instructionProjectionNativeLocations = (
  snapshot: InstructionProjectionSnapshot,
  mode: "reconcile" | "remove",
  sourceWrites: ReadonlyArray<string> = [],
) => {
  const changes = plannedInstructionChanges(snapshot, mode, sourceWrites).flatMap(
    instructionChangeEffect(snapshot),
  );
  return instructionChangeLocations({
    snapshot,
    before: snapshot,
    written: changes.filter((change) => change.change !== "removed").map((change) => change.path),
    removed: changes.filter((change) => change.change === "removed").map((change) => change.path),
  });
};

export interface ObserveInstructionProjectionArgs {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly config: ResolvedInstructionsConfig;
  readonly nativeDirectoryInputs?: NativeDirectoryInputs;
  readonly eligibleAgentIds?: ReadonlyArray<string>;
  /** Physical entry routes proven absent from the prior configured readership. */
  readonly eligibleTargets?: ReadonlyArray<string>;
  readonly symlinkSupported?: boolean;
  /** Canonical roots this proposed closure will create; their sources still observe as missing. */
  readonly prospectiveRoots?: ReadonlyArray<string>;
  /** Sources withdrawn by a region owner in this transition, never inferred from absence. */
  readonly withdrawnSources?: ReadonlyArray<string>;
  /** True only when the supplied filesystem is a snapshot of the Git index. */
  readonly gitIndexView?: boolean;
  /**
   * Recorded `instructions` projection rows. Callers read them before
   * observing, so a lockfile this CLI cannot read fails before any write.
   */
  readonly rows: InstructionProjectionRows;
  /** Overwrite a differing file at a planned copy path that AXM has no record of writing. */
  readonly replaceUnrecorded?: boolean;
  /** Delete recorded copies even when they were modified since AXM last wrote them. */
  readonly discardModified?: boolean;
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
    const nativeRoots = nativeAuthorityRoots(
      path,
      args,
      args.nativeDirectoryInputs ?? { skillsDirectoryOverrides: {} },
    );
    const tree = yield* discoverInstructionTree(
      args.workspaceRoot,
      args.config.fileName,
      args.scope,
      args.nativeDirectoryInputs,
    );
    const routes = buildInstructionProjectionPlan({
      roots: [args.workspaceRoot],
      scope: args.scope,
      ...(args.nativeDirectoryInputs === undefined
        ? {}
        : { nativeDirectoryInputs: args.nativeDirectoryInputs }),
      configuredAgents: args.configuredAgents,
      sourceFileName: args.config.fileName,
      path,
    });
    const recordedRoots = [...args.rows.keys()].flatMap((key) =>
      routes.items.flatMap((item) => {
        if (item.action === "skip") return [];
        const relative = path
          .relative(args.workspaceRoot, item.targetPath)
          .split(path.sep)
          .join("/");
        return key === relative ? [args.workspaceRoot] : [];
      }),
    );
    const aliasEvidence = yield* Effect.filter(
      tree.candidates.filter(
        (candidate) =>
          !tree.roots.includes(args.workspaceRoot) &&
          candidate.root === args.workspaceRoot &&
          args.configuredAgents.includes(candidate.agentId),
      ),
      (candidate) =>
        Effect.gen(function* () {
          const entry = yield* resolveNativeEntry(candidate.targetPath).pipe(Effect.option);
          if (Option.isNone(entry) || entry.value.kind !== "file") return true;
          const content = yield* readFileOption(
            candidate.targetPath,
            args.workspaceRoot,
            nativeRoots,
          );
          // Empty unrecorded files establish neither content nor historical projection.
          return Option.isNone(content) || content.value.length > 0;
        }),
    );
    const roots = [
      ...new Set([
        ...tree.roots,
        ...aliasEvidence.map((candidate) => candidate.root),
        ...recordedRoots,
        ...(args.prospectiveRoots ?? []),
      ]),
    ].filter(
      (root) =>
        tree.roots.includes(root) ||
        (args.prospectiveRoots ?? []).includes(root) ||
        !(args.withdrawnSources ?? []).includes(path.resolve(root, args.config.fileName)),
    );
    const proposed = buildInstructionProjectionPlan({
      roots,
      scope: args.scope,
      ...(args.nativeDirectoryInputs === undefined
        ? {}
        : { nativeDirectoryInputs: args.nativeDirectoryInputs }),
      configuredAgents: args.configuredAgents,
      sourceFileName: args.config.fileName,
      path,
    });
    const symlinkSupported =
      args.symlinkSupported ?? (yield* probeSymlinkSupport(args.workspaceRoot));
    const items = yield* observePlannedItems({
      workspaceRoot: args.workspaceRoot,
      nativeRoots,
      plan: proposed,
      config: args.config,
      symlinkSupported,
      rows: args.rows,
      prospectiveRoots: args.prospectiveRoots ?? [],
    });
    const plan = {
      ...proposed,
      items: proposed.items.filter(
        (item) =>
          item.action === "skip" ||
          items.some(
            (observed) => observed.root === item.root && observed.agentId === item.agentId,
          ),
      ),
    };
    const desiredTargets = new Set(
      proposed.items.flatMap((item) =>
        item.action === "skip" ? [] : [path.resolve(item.targetPath)],
      ),
    );
    // Candidates are only the alias names actually present at visited
    // directories — a handful in practice — so sequential classification adds
    // no fan-out beyond the walk and keeps the reported order deterministic.
    const staleTargets = (yield* Effect.forEach(
      tree.candidates.filter(
        (candidate) => !desiredTargets.has(path.resolve(candidate.targetPath)),
      ),
      (candidate) =>
        observeStaleCandidate(
          candidate,
          args.config.fileName,
          args.workspaceRoot,
          nativeRoots,
          args.rows,
        ),
      { concurrency: 1 },
    ))
      .filter(Option.isSome)
      .map((item) => item.value);
    const missingSources = (yield* Effect.forEach(plan.roots, (root) =>
      readFileOption(path.join(root, args.config.fileName), args.workspaceRoot).pipe(
        Effect.map((content) =>
          Option.isSome(content) ? [] : [path.join(root, args.config.fileName)],
        ),
      ),
    )).flat();
    const gitignore = yield* observeInstructionsGitignore({
      workspaceRoot: args.workspaceRoot,
      plan,
      config: args.config,
      gitIndexView: args.gitIndexView === true,
      rows: args.rows,
    });
    // A row is kept only while a copy it records is still observed or about
    // to be written; links, the canonical file, and vanished paths need none.
    const recordedCopies = new Set(
      (yield* Effect.forEach(
        [...items, ...staleTargets].filter(
          (item) =>
            isProjectedTarget(item) &&
            (item.observedForm === "copy" ||
              item.observedForm === "none" ||
              item.ownership === "unowned"),
        ),
        (item) =>
          observedUnitPath(args.workspaceRoot, item.targetFile).pipe(Effect.map(Option.toArray)),
      )).flat(),
    );
    // The `.gitignore` row outlives its region only when no region is wanted
    // and none is left to remove; withdrawing it then writes no file.
    const orphanRows = [...args.rows.keys()]
      .filter((unit) =>
        unit === GITIGNORE_UNIT
          ? !gitignore.desired && !gitignore.managed && gitignore.current
          : !recordedCopies.has(unit),
      )
      .sort((left, right) => left.localeCompare(right, "en"));
    const witnessPaths = [
      ...new Set([
        ...plan.items.flatMap((item) =>
          item.action === "skip"
            ? []
            : item.action === "adapter"
              ? [item.sourcePath]
              : [item.sourcePath, item.targetPath],
        ),
        ...staleTargets.flatMap((item) => [item.sourceFile, item.targetFile]),
        gitignore.file,
      ]),
    ].sort();
    const witnesses = yield* Effect.forEach(witnessPaths, (target) =>
      instructionWitness(args.workspaceRoot, target, undefined, nativeRoots).pipe(
        Effect.map((witness) => ({ path: target, ...witness })),
      ),
    );
    const ignoreAddress = yield* assertNativeMutationWithin(
      args.workspaceRoot,
      gitignore.file,
      "content",
    ).pipe(Effect.option);
    const ignorePhysical = Option.isSome(ignoreAddress)
      ? (ignoreAddress.value.referentPath ?? ignoreAddress.value.entryPath)
      : gitignore.file;
    return {
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
      nativeRoots,
      witnesses,
      eligibleAgentIds: args.eligibleAgentIds ?? [],
      ...(args.eligibleTargets === undefined ? {} : { eligibleTargets: args.eligibleTargets }),
      nativeLocations: [
        ...(yield* observeInstructionNativeLocations({
          workspaceRoot: args.workspaceRoot,
          scope: args.scope,
          roots: plan.roots,
          items: [...items, ...staleTargets],
          configuredAgentIds: args.configuredAgents,
          ...(args.nativeDirectoryInputs === undefined
            ? {}
            : { nativeDirectoryInputs: args.nativeDirectoryInputs }),
        })),
        ...(gitignore.managed || gitignore.desired
          ? [
              {
                scope: args.scope,
                address: {
                  kind: "region" as const,
                  path: ignorePhysical,
                  region: "instruction-aliases",
                },
                aliases: [gitignore.file],
                configuredConsumers: [],
                potentialReaders: [],
                policyReasons: ["instruction-alias-ignore"],
                ownership: gitignore.managed ? ("owned" as const) : ("absent" as const),
                state: gitignore.managed ? ("unchanged" as const) : ("absent" as const),
                mechanism: "managed-region" as const,
                availability: [],
              },
            ]
          : []),
      ],
      plan,
      symlinkSupported,
      rows: args.rows,
      orphanRows,
      replaceUnrecorded: args.replaceUnrecorded === true,
      discardModified: args.discardModified === true,
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
  snapshot: Pick<InstructionProjectionSnapshot, "status" | "replaceUnrecorded">,
  action: "overwrite" | "remove",
): ReadonlyArray<InstructionStatusItem> =>
  snapshot.status.items.filter(
    (item) =>
      isProjectedTarget(item) &&
      item.ownership === "unowned" &&
      (action === "remove" || !replaceableUnrecorded(snapshot, item)),
  );

/**
 * Refuse unowned planned targets. The detail names `--replace-unrecorded` only
 * when the invocation's command offers it.
 */
const unownedTargetsFailure = (
  blockers: ReadonlyArray<InstructionStatusItem>,
  action: "overwrite" | "remove",
): Effect.Effect<never, InstructionMaintenanceFailed> =>
  Effect.flatMap(ProjectionOutputPosture, (posture) => {
    const files = blockers.filter((item) => item.observedForm === "file");
    const replaceable = action === "overwrite" && files.length === blockers.length;
    const remedy =
      posture.replaceUnrecorded === false
        ? `rerun with ${REPLACE_UNRECORDED_FLAG} to overwrite it, or move the file aside`
        : "move the file aside to let AXM write it";
    return Effect.fail(
      new InstructionMaintenanceFailed({
        category: "conflict",
        ...(replaceable
          ? {
              problem: {
                code: "projection-output-unrecorded" as const,
                paths: blockers.map((item) => item.targetFile),
              },
            }
          : {}),
        detail: replaceable
          ? `${blockers
              .map((item) => item.targetFile)
              .join(", ")} exists with different content and has no recorded projection; ${remedy}`
          : `Instruction ${action === "overwrite" ? "reconciliation would overwrite" : "cleanup would remove"} files with unknown ownership: ${blockers
              .map((item) => item.targetFile)
              .join(", ")}`,
        suggestions: [
          {
            description: "Inspect instruction-file ownership and drift",
            cmd: "axm instructions",
          },
        ],
      }),
    );
  });

/**
 * Whether every projected target with a canonical source is current, every
 * copy is recorded, no owned residue or orphaned row remains, and the managed
 * `.gitignore` region is current. Rows whose source is missing are not judged
 * here: nothing can be written for them, and the caller decides whether a
 * missing canonical file is its concern — the sync plan treats it as work,
 * `axm lint --fix` leaves it to its author.
 */
export const instructionProjectionIsCurrent = (snapshot: InstructionProjectionSnapshot): boolean =>
  snapshot.status.items.every(
    (item) =>
      !isProjectedTarget(item) ||
      ((item.health === "ok" || item.health === "missing-source") &&
        item.ownership !== "owned-unrecorded-identical"),
  ) &&
  snapshot.status.staleTargets.length === 0 &&
  snapshot.orphanRows.length === 0 &&
  snapshot.gitignore.current;

/**
 * The hard blocker every mutation shares: a differing file AXM has no record
 * of writing at a planned target stops the whole operation before any write,
 * unless the caller asked to replace unrecorded files.
 */
export const assertInstructionTargetsSafe = (
  snapshot: Pick<InstructionProjectionSnapshot, "status" | "replaceUnrecorded">,
): Effect.Effect<void, InstructionMaintenanceFailure> =>
  Effect.gen(function* () {
    const blockers = unownedInstructionTargets(snapshot, "overwrite");
    if (blockers.length === 0) return;
    return yield* unownedTargetsFailure(blockers, "overwrite");
  });

// -----------------------------------------------------------------------------
// Mutation — decisions come from the snapshot; results come from reading back.
// -----------------------------------------------------------------------------

const writeFile = (filePath: string, content: string) =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const existed = yield* fs.exists(filePath).pipe(
        Effect.mapError(
          (error) =>
            new InstructionMaintenanceFailed({
              category: "internal",
              detail: `Failed to inspect instruction file: ${filePath}`,
              cause: error,
            }),
        ),
      );
      yield* protectCreatedAncestors(fs, path, path.dirname(filePath));
      yield* protectWorkspacePath(filePath);
      yield* fs.makeDirectory(path.dirname(filePath), { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new InstructionMaintenanceFailed({
              category: "internal",
              detail: `Failed to create instruction-file directory: ${path.dirname(filePath)}`,
              cause: error,
            }),
        ),
      );
      yield* fs.writeFileString(filePath, content).pipe(
        Effect.mapError(
          (error) =>
            new InstructionMaintenanceFailed({
              category: "internal",
              detail: `Failed to write instruction file: ${filePath}`,
              cause: error,
            }),
        ),
      );
      yield* recordFootprint({ path: filePath, change: existed ? "modified" : "created" });
    }),
  );

const insertionFailure = (cause: unknown) =>
  new InstructionMaintenanceFailed({
    category: "conflict",
    detail: "Instruction container ownership could not be preserved",
    cause,
  });

const aliasDirectoryUnit = (target: string) =>
  JSON.stringify(["instruction-alias-directories", target]);

const removeTargetFile = (targetPath: string, cleanupDirectories = true) =>
  Effect.gen(function* () {
    const authority = yield* NativeWriteAuthority;
    yield* retireWorkspacePath(targetPath).pipe(
      Effect.mapError(
        (cause) =>
          new InstructionMaintenanceFailed({
            category: "internal",
            detail: `Failed to remove managed instruction target: ${targetPath}`,
            cause,
          }),
      ),
    );
    if (cleanupDirectories)
      yield* authority
        .retireCreatedDirectories({ path: targetPath, unit: aliasDirectoryUnit(targetPath) })
        .pipe(Effect.mapError(insertionFailure));
  });

interface PreparedInstructionTarget extends InstructionStatusItem {
  readonly observedPaths: ReadonlyArray<string>;
  /** The row key of the planned (lexical) target. */
  readonly unit: Option.Option<ProjectionUnitPath>;
}

/**
 * Resolve entries, recheck each target against the decision its change was
 * planned from, and negotiate every shared target before writing. A target
 * observed differently than planned refuses the whole operation.
 */
const preparePhysicalInstructionTargets = (
  snapshot: InstructionProjectionSnapshot,
  items: ReadonlyArray<InstructionStatusItem>,
  purpose: "write" | "record" | "remove",
) =>
  Effect.gen(function* () {
    const { workspaceRoot, nativeRoots } = snapshot;
    const targets = new Map<string, PreparedInstructionTarget>();
    for (const item of items) {
      const { address } = yield* assertNativeMutationWithinRoots(
        nativeRoots ?? [workspaceRoot],
        item.targetFile,
        "entry",
        workspaceRoot,
      );
      const { address: source } = yield* assertNativeMutationWithinRoots(
        nativeRoots ?? [workspaceRoot],
        item.sourceFile,
        "content",
        workspaceRoot,
      );
      const sourceFile = source.referentPath ?? source.entryPath;
      const current = yield* observeTargetPath({
        workspaceRoot,
        ...(nativeRoots === undefined ? {} : { nativeRoots }),
        sourcePath: sourceFile,
        targetPath: address.entryPath,
        sourceFileName: snapshot.status.sourceFileName,
        sourceContent: yield* readFileOption(sourceFile, workspaceRoot, nativeRoots),
        rows: snapshot.rows,
      });
      if (
        current.ownership === "unowned" &&
        (purpose !== "write" || !replaceableUnrecorded(snapshot, { ...item, ...current }))
      )
        return yield* unownedTargetsFailure(
          [{ ...item, ...current }],
          purpose === "remove" ? "remove" : "overwrite",
        );
      if (purpose === "record" && current.ownership !== "owned-unrecorded-identical")
        return yield* new InstructionMaintenanceFailed({
          category: "conflict",
          detail: `Instruction input changed after observation: ${item.targetFile}`,
        });
      const prior = targets.get(address.entryPath);
      if (
        prior !== undefined &&
        (prior.sourceFile !== sourceFile || prior.mechanism !== item.mechanism)
      ) {
        return yield* new InstructionMaintenanceFailed({
          category: "conflict",
          detail: `Instruction consumers require incompatible content at ${address.entryPath}`,
        });
      }
      targets.set(address.entryPath, {
        ...item,
        ...current,
        targetFile: address.entryPath,
        sourceFile,
        observedPaths: [...(prior?.observedPaths ?? []), item.targetFile, item.sourceFile],
        unit: yield* scopeUnitPath(workspaceRoot, item.targetFile),
      });
    }
    return [...targets.values()];
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof InstructionMaintenanceFailed
        ? cause
        : new InstructionMaintenanceFailed({
            category: "conflict",
            detail: "Instruction target leaves the selected workspace authority",
            cause,
          }),
    ),
  );

/** The withdrawal of a target's row, when one is recorded. */
const rowWithdrawal = (
  snapshot: InstructionProjectionSnapshot,
  unit: Option.Option<ProjectionUnitPath>,
): Option.Option<ProjectionRowChange> =>
  Option.map(
    Option.filter(unit, (key) => snapshot.rows.has(key)),
    withdrawRow,
  );

/**
 * The deletion guard's verdict for one owned target. A link is proven by its
 * referent; a copy is deleted only when its bytes are AXM's last write or the
 * current source, or the caller discards modified copies.
 */
const decideTargetRemoval = (
  snapshot: InstructionProjectionSnapshot,
  item: PreparedInstructionTarget,
) =>
  Effect.gen(function* () {
    if (item.observedForm === "symlink" || item.observedForm === "broken-link")
      return { _tag: "delete" } as const;
    const bytes = yield* readFileOption(
      item.targetFile,
      snapshot.workspaceRoot,
      snapshot.nativeRoots,
    );
    return decideOutputDeletion({
      bytes,
      recorded: recordedRow(snapshot.rows, item.unit),
      expectedRender: yield* readFileOption(
        item.sourceFile,
        snapshot.workspaceRoot,
        snapshot.nativeRoots,
      ),
      discardModified: snapshot.discardModified,
    });
  });

interface TargetRemovals {
  readonly removed: ReadonlyArray<string>;
  readonly retained: ReadonlyArray<RetainedInstructionTarget>;
  readonly rowChanges: ReadonlyArray<ProjectionRowChange>;
}

/** Remove owned targets through the deletion guard; every target's row is withdrawn. */
const removeGuardedTargets = (
  snapshot: InstructionProjectionSnapshot,
  targets: ReadonlyArray<PreparedInstructionTarget>,
  dryRun: boolean,
) =>
  Effect.gen(function* () {
    const removed: Array<string> = [];
    const retained: Array<RetainedInstructionTarget> = [];
    const rowChanges: Array<ProjectionRowChange> = [];
    for (const item of targets) {
      if (!dryRun) yield* assertInstructionWitnesses(snapshot, new Set(item.observedPaths));
      const decision = yield* decideTargetRemoval(snapshot, item);
      if (decision._tag === "delete") {
        if (!dryRun) yield* removeTargetFile(item.targetFile);
        removed.push(item.targetFile);
      } else {
        retained.push({ path: item.targetFile, reason: decision.reason });
      }
      rowChanges.push(...Option.toArray(rowWithdrawal(snapshot, item.unit)));
    }
    return { removed, retained, rowChanges } satisfies TargetRemovals;
  });

/**
 * Remove every target AXM owns — the current plan's owned aliases and all
 * stale residue — refusing the whole operation if any planned target is
 * unowned. A copy whose bytes AXM cannot show are its own is retained and
 * reported. With `dryRun` nothing is touched and the same outcome is returned.
 */
export const removeManagedInstructionTargets = (args: {
  readonly snapshot: InstructionProjectionSnapshot;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const blockers = unownedInstructionTargets(args.snapshot, "remove");
    if (blockers.length > 0) {
      return yield* unownedTargetsFailure(blockers, "remove");
    }
    const targets = yield* preparePhysicalInstructionTargets(
      args.snapshot,
      plannedInstructionChanges(args.snapshot, "remove").flatMap((change) =>
        change.kind === "owned-alias" || change.kind === "stale" ? [change.item] : [],
      ),
      "remove",
    );
    if (!args.dryRun) yield* assertInstructionWitnesses(args.snapshot);
    const removals = yield* removeGuardedTargets(args.snapshot, targets, args.dryRun);
    return {
      ...removals,
      rowChanges: [...removals.rowChanges, ...args.snapshot.orphanRows.map(withdrawRow)],
    } satisfies TargetRemovals;
  });

/** Write one target already selected by plannedInstructionChanges; returns its row edit. */
const writeOneTarget = (args: {
  readonly snapshot: InstructionProjectionSnapshot;
  readonly item: PreparedInstructionTarget;
  readonly sourceContent: string;
}) =>
  Effect.gen(function* () {
    const { item } = args;
    if (item.mechanism === "symlink") {
      yield* createSymlink({ target: item.sourceFile, link: item.targetFile });
      return rowWithdrawal(args.snapshot, item.unit);
    }
    if (Option.isNone(item.unit))
      return yield* new InstructionMaintenanceFailed({
        category: "conflict",
        detail: `Instruction copy cannot be recorded outside its scope root: ${item.targetFile}`,
      });
    if (item.observedForm === "symlink" || item.observedForm === "broken-link")
      yield* removeTargetFile(item.targetFile, false);
    yield* writeFile(item.targetFile, args.sourceContent);
    return Option.some<ProjectionRowChange>({
      kind: INSTRUCTIONS_KIND,
      path: item.unit.value,
      row: {
        gen: copyGeneration(
          item.unit.value,
          args.snapshot.status.sourceFileName,
          args.sourceContent,
        ),
        output: projectionOutputDigest(args.sourceContent),
      },
    });
  });

/** Render the alias region as `patterns`, refusing when the render would break the file's fences. */
const renderGitignore = (filePath: string, raw: string, patterns: ReadonlyArray<string>) =>
  Option.match(reconcileGitignorePatterns(raw, patterns), {
    onNone: () => Effect.fail(unsafeGitignoreRegionFailure(filePath)),
    onSome: (updated) => Effect.succeed(updated),
  });

/** The `.gitignore` as written, so its row can record the region AXM left there. */
interface WrittenGitignore {
  readonly path: string;
  readonly raw: string;
}

const writeGitignoreRegion = (args: {
  readonly workspaceRoot: string;
  readonly patterns: ReadonlyArray<string>;
  readonly eligiblePatterns?: ReadonlySet<string>;
  readonly dryRun?: boolean;
}) =>
  Effect.gen(function* () {
    if (!(yield* isGitManaged(args.workspaceRoot))) return Option.none<WrittenGitignore>();
    const lexical = yield* instructionGitignorePath(args.workspaceRoot);
    const address = yield* instructionContentAddress(args.workspaceRoot, lexical);
    const filePath = address.referentPath ?? address.entryPath;
    const authority = yield* NativeWriteAuthority;
    const run = Effect.gen(function* () {
      let current = yield* readFileOption(filePath, args.workspaceRoot);
      let raw = Option.getOrElse(current, () => "");
      const region = gitignoreRegion(raw);
      if (Option.isNone(region)) return yield* unsafeGitignoreRegionFailure(filePath);
      const previous =
        region.value.state === "complete"
          ? region.value.body.split(/\r?\n/).filter((line) => line.length > 0)
          : [];
      const removed = previous.filter((pattern) => !args.patterns.includes(pattern));
      const added = args.patterns.filter((pattern) => !previous.includes(pattern));
      const unit = (pattern: string) => JSON.stringify(["instruction-ignore-pattern", pattern]);
      const target = (pattern: string) => ({
        path: filePath,
        aliases: [lexical],
        unit: unit(pattern),
      });
      let patterns = previous.filter((pattern) => args.patterns.includes(pattern));
      const written = () => Option.some<WrittenGitignore>({ path: filePath, raw });
      const publish = (next: string, pattern: string, eligible: boolean) =>
        Effect.gen(function* () {
          if (eligible && Option.isNone(deriveStructuralInverse(raw, next)))
            return yield* new InstructionMaintenanceFailed({
              category: "conflict",
              detail: `Instruction ignore insertion cannot preserve the authored container: ${lexical}`,
            });
          if (!args.dryRun) {
            const capture = yield* authority
              .captureInsertion({ ...target(pattern), beforeRaw: current, eligible })
              .pipe(Effect.mapError(insertionFailure));
            const createdDirectories = yield* authority
              .createParentDirectories(filePath)
              .pipe(Effect.mapError(insertionFailure));
            yield* Effect.uninterruptible(
              writeFile(filePath, next).pipe(
                Effect.andThen(
                  authority
                    .recordInsertion({ capture, afterRaw: next, createdDirectories })
                    .pipe(Effect.mapError(insertionFailure)),
                ),
              ),
            );
          }
          raw = next;
          current = Option.some(next);
        });
      // Replacing routing intent updates the existing region in place. Removing
      // it first would relocate the replacement past authored suffix bytes, and
      // an intervening removal does not establish a new exact-insertion premise.
      const replaced = removed[0];
      if (replaced !== undefined && added.length > 0) {
        const next = yield* renderGitignore(filePath, raw, args.patterns);
        if (next !== raw) yield* publish(next, replaced, false);
        if (!args.dryRun)
          for (const pattern of removed)
            yield* authority
              .forgetInsertion(target(pattern))
              .pipe(Effect.mapError(insertionFailure));
        return written();
      }
      if (removed.length > 0) {
        const standard = yield* renderGitignore(filePath, raw, patterns);
        const inverse = yield* authority
          .resolveInsertions({ path: filePath, aliases: [lexical], units: removed.map(unit), raw })
          .pipe(Effect.mapError(insertionFailure));
        const first = removed[0];
        if (
          first !== undefined &&
          (standard.length === 0 ||
            Option.exists(inverse, (value) => value.kind === "remove-file")) &&
          !args.dryRun &&
          (yield* authority
            .retireInsertion({ ...target(first), raw, empty: patterns.length === 0 })
            .pipe(Effect.mapError(insertionFailure)))
        ) {
          raw = "";
          current = Option.none();
        } else {
          const next =
            Option.isSome(inverse) && inverse.value.kind === "restore-text"
              ? inverse.value.text
              : standard;
          if (first !== undefined && next !== raw) yield* publish(next, first, false);
        }
        if (!args.dryRun)
          for (const pattern of removed)
            yield* authority
              .forgetInsertion(target(pattern))
              .pipe(Effect.mapError(insertionFailure));
      }
      for (const pattern of added) {
        patterns = [...patterns, pattern].sort();
        yield* publish(
          yield* renderGitignore(filePath, raw, patterns),
          pattern,
          args.eligiblePatterns?.has(pattern) === true,
        );
      }
      if (removed.length === 0 && added.length === 0) {
        const next = yield* renderGitignore(filePath, raw, args.patterns);
        if (next !== raw && !args.dryRun) {
          yield* writeFile(filePath, next);
          raw = next;
        }
      }
      return written();
    });
    return yield* args.dryRun
      ? run
      : authority.withExclusiveWrite(filePath, run).pipe(Effect.mapError(insertionFailure));
  });

export const removeInstructionsGitignore = (args: {
  readonly workspaceRoot: string;
  readonly rows: InstructionProjectionRows;
  readonly dryRun: boolean;
}): Effect.Effect<
  {
    readonly path: Option.Option<string>;
    readonly rowChange: Option.Option<ProjectionRowChange>;
  },
  InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const recorded = Option.fromNullishOr(args.rows.get(GITIGNORE_UNIT));
    const unchanged = {
      path: Option.none<string>(),
      rowChange: Option.isSome(recorded)
        ? Option.some(withdrawRow(GITIGNORE_UNIT))
        : Option.none<ProjectionRowChange>(),
    };
    if (!(yield* isGitManaged(args.workspaceRoot))) return unchanged;
    const lexical = yield* instructionGitignorePath(args.workspaceRoot);
    const address = yield* instructionContentAddress(args.workspaceRoot, lexical);
    const filePath = address.referentPath ?? address.entryPath;
    const content = yield* readFileOption(filePath, args.workspaceRoot);
    if (Option.isNone(content)) return unchanged;
    const state = managedGitignoreRegionState(content.value);
    if (state === "absent") return unchanged;
    if (args.dryRun && state === "complete") return { ...unchanged, path: Option.some(filePath) };
    const written = yield* writeGitignoreRegion({
      workspaceRoot: args.workspaceRoot,
      patterns: [],
    });
    return {
      path: Option.map(written, ({ path }) => path),
      rowChange: Option.isSome(written)
        ? gitignoreRowChange({ raw: written.value.raw, patterns: [], recorded })
        : unchanged.rowChange,
    };
  });

/** Rows recording copies whose bytes were just re-observed equal to their source. */
const recordPreparedCopies = (
  snapshot: InstructionProjectionSnapshot,
  records: ReadonlyArray<PreparedInstructionTarget>,
) =>
  Effect.forEach(
    records,
    (item) =>
      Effect.gen(function* () {
        yield* assertInstructionWitnesses(snapshot, new Set(item.observedPaths));
        const sourceContent = yield* readFileOption(item.sourceFile, snapshot.workspaceRoot);
        if (Option.isNone(sourceContent) || Option.isNone(item.unit))
          return yield* new InstructionMaintenanceFailed({
            category: "conflict",
            detail: `Instruction input changed after observation: ${item.targetFile}`,
          });
        return {
          kind: INSTRUCTIONS_KIND,
          path: item.unit.value,
          row: {
            gen: copyGeneration(
              item.unit.value,
              snapshot.status.sourceFileName,
              sourceContent.value,
            ),
            output: projectionOutputDigest(sourceContent.value),
          },
        } satisfies ProjectionRowChange;
      }),
    { concurrency: 1 },
  );

/**
 * Rows for copies AXM has no record of writing whose bytes already equal
 * their source. A caller about to rewrite a canonical file records them first,
 * so the copies stay provably AXM's when the source changes under them.
 */
export const recordIdenticalInstructionCopies = (snapshot: InstructionProjectionSnapshot) =>
  Effect.gen(function* () {
    const records = yield* preparePhysicalInstructionTargets(
      snapshot,
      plannedInstructionChanges(snapshot, "reconcile").flatMap((change) =>
        change.kind === "record" ? [change.item] : [],
      ),
      "record",
    );
    return yield* recordPreparedCopies(snapshot, records);
  });

/** What applying an instruction projection did, and the row edits it produced. */
export interface AppliedInstructionProjection {
  readonly written: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly retained: ReadonlyArray<RetainedInstructionTarget>;
  readonly rowChanges: ReadonlyArray<ProjectionRowChange>;
}

/**
 * Apply the desired state the snapshot describes. Stale residue is removed
 * first through the deletion guard, then targets are written and identical
 * copies recorded, then the `.gitignore` region is rewritten — an ignore entry
 * is never dropped while the file it covers remains, so a removed alias is not
 * exposed to Git between steps. A differing unrecorded file at a planned
 * target refuses the whole application unless the snapshot replaces it.
 */
export const applyInstructionProjection = (args: {
  readonly workspaceRoot: string;
  readonly config: ResolvedInstructionsConfig;
  readonly snapshot: InstructionProjectionSnapshot;
  readonly dryRun: boolean;
}): Effect.Effect<
  AppliedInstructionProjection,
  InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const { snapshot } = args;
    yield* assertInstructionTargetsSafe(snapshot);
    const changes = plannedInstructionChanges(snapshot, "reconcile");
    const stale = yield* preparePhysicalInstructionTargets(
      snapshot,
      changes.flatMap((change) => (change.kind === "stale" ? [change.item] : [])),
      "remove",
    );
    const targets = yield* preparePhysicalInstructionTargets(
      snapshot,
      changes.flatMap((change) => (change.kind === "target" ? [change.item] : [])),
      "write",
    );
    const records = yield* preparePhysicalInstructionTargets(
      snapshot,
      changes.flatMap((change) => (change.kind === "record" ? [change.item] : [])),
      "record",
    );
    const gitignore = changes.find((change) => change.kind === "gitignore");
    const path = yield* Path.Path;
    const patterns = desiredGitignorePatterns({
      enabled: args.config.gitignoreAliases,
      path,
      workspaceRoot: args.workspaceRoot,
      plan: snapshot.plan,
    });
    const eligibleItems = (yield* Effect.forEach(snapshot.plan.items, (item) =>
      Effect.gen(function* () {
        if (item.action === "skip" || !snapshot.eligibleAgentIds.includes(item.agentId)) return [];
        const entry = yield* resolveNativeEntry(item.targetPath).pipe(
          Effect.mapError(insertionFailure),
        );
        return snapshot.eligibleTargets === undefined ||
          snapshot.eligibleTargets.includes(entry.entryPath)
          ? [item]
          : [];
      }),
    )).flat();
    const eligiblePatterns = new Set(
      desiredGitignorePatterns({
        enabled: args.config.gitignoreAliases,
        path,
        workspaceRoot: args.workspaceRoot,
        plan: { ...snapshot.plan, items: eligibleItems },
      }),
    );
    if (gitignore !== undefined) {
      yield* assertInstructionsGitignoreSafe(args.workspaceRoot);
      yield* writeGitignoreRegion({
        workspaceRoot: args.workspaceRoot,
        patterns,
        eligiblePatterns,
        dryRun: true,
      });
    }
    const written = [
      ...targets.map((item) => item.targetFile),
      ...(gitignore?.kind === "gitignore" ? [gitignore.path] : []),
    ];
    if (args.dryRun) {
      const removals = yield* removeGuardedTargets(snapshot, stale, true);
      return { written, removed: removals.removed, retained: removals.retained, rowChanges: [] };
    }
    if (changes.length > 0) yield* assertInstructionWitnesses(snapshot);
    const removals = yield* removeGuardedTargets(snapshot, stale, false);
    const targetRows = yield* Effect.forEach(
      targets,
      (item) =>
        Effect.gen(function* () {
          yield* assertInstructionWitnesses(snapshot, new Set(item.observedPaths));
          const sourceContent = yield* readFileOption(item.sourceFile, args.workspaceRoot);
          if (Option.isNone(sourceContent)) {
            return yield* new InstructionMaintenanceFailed({
              category: "internal",
              detail: `Instruction source disappeared before projection: ${item.sourceFile}`,
            });
          }
          const authority = yield* NativeWriteAuthority;
          const eligible =
            snapshot.eligibleAgentIds.includes(item.agentId) &&
            (snapshot.eligibleTargets === undefined ||
              snapshot.eligibleTargets.includes(item.targetFile));
          const directories = yield* authority
            .captureCreatedDirectories({
              path: item.targetFile,
              unit: aliasDirectoryUnit(item.targetFile),
              eligible,
            })
            .pipe(Effect.mapError(insertionFailure));
          const createdDirectories = yield* authority
            .createParentDirectories(item.targetFile)
            .pipe(Effect.mapError(insertionFailure));
          return yield* Effect.uninterruptible(
            writeOneTarget({ snapshot, item, sourceContent: sourceContent.value }).pipe(
              Effect.tap(() =>
                authority
                  .recordCreatedDirectories({ capture: directories, createdDirectories })
                  .pipe(Effect.mapError(insertionFailure)),
              ),
            ),
          );
        }),
      { concurrency: 1 },
    );
    const recordRows = yield* recordPreparedCopies(snapshot, records);
    let gitignoreRow = Option.none<ProjectionRowChange>();
    if (gitignore?.kind === "gitignore") {
      yield* assertInstructionWitnesses(snapshot, new Set([gitignore.path]));
      const writtenIgnore = yield* writeGitignoreRegion({
        workspaceRoot: args.workspaceRoot,
        patterns,
        eligiblePatterns,
      });
      gitignoreRow = Option.flatMap(writtenIgnore, ({ raw }) =>
        gitignoreRowChange({
          raw,
          patterns,
          recorded: Option.fromNullishOr(snapshot.rows.get(GITIGNORE_UNIT)),
        }),
      );
    }
    return {
      written,
      removed: removals.removed,
      retained: removals.retained,
      rowChanges: [
        ...removals.rowChanges,
        ...targetRows.flatMap(Option.toArray),
        ...recordRows,
        ...Option.toArray(gitignoreRow),
        ...snapshot.orphanRows.map(withdrawRow),
      ],
    };
  });

/** Native outcomes for targets the deletion guard retained. */
const retainedLocations = (
  snapshot: InstructionProjectionSnapshot,
  retained: ReadonlyArray<RetainedInstructionTarget>,
  posture: ProjectionOutputPostureValue,
): ReadonlyArray<NativeLocationOutcome> =>
  retained.flatMap(({ path, reason }) =>
    snapshot.nativeLocations
      .filter((location) => location.address.path === path || location.aliases.includes(path))
      .map((location): NativeLocationOutcome => {
        const { proof: _proof, ...facts } = location;
        return {
          ...facts,
          ownership: "unowned",
          state: "retained",
          reason: retainedOutputDetail(path, reason, posture),
        };
      }),
  );

export const syncResult = (args: {
  readonly snapshot: InstructionProjectionSnapshot;
  readonly before?: InstructionProjectionSnapshot;
  readonly written: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly retained?: ReadonlyArray<RetainedInstructionTarget>;
  readonly rowChanges?: ReadonlyArray<ProjectionRowChange>;
  /** The invocation's overrides, so a retention warning names only an offered flag. */
  readonly posture: ProjectionOutputPostureValue;
}): InstructionsSyncResult => ({
  nativeLocations: combineNativeLocationOutcomes([
    ...instructionChangeLocations(args),
    ...retainedLocations(args.before ?? args.snapshot, args.retained ?? [], args.posture),
  ]),
  snapshot: args.snapshot,
  written: args.written,
  removed: args.removed,
  retained: args.retained ?? [],
  rowChanges: args.rowChanges ?? [],
  skipped: args.snapshot.status.items
    .filter((item) => item.health !== "ok")
    .map((item) => item.targetFile),
});

export interface SyncInstructionsArgs extends ObserveInstructionProjectionArgs {
  readonly dryRun: boolean;
}

/**
 * Observe, apply, and read back. A differing unrecorded file at a planned
 * target refuses the run unless `replaceUnrecorded` is set. The returned
 * `rowChanges` are the caller's to stage inside its accepted-resolution
 * batch. A dry run returns the paths a real run would write and remove,
 * reports the pre-write observation unchanged, and produces no row edits.
 */
export const syncInstructions = (
  args: SyncInstructionsArgs,
): Effect.Effect<
  InstructionsSyncResult,
  InstructionMaintenanceFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
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
          rows: withInstructionRowChanges(args.rows, applied.rowChanges),
          symlinkSupported: snapshot.symlinkSupported,
        });
    return syncResult({
      snapshot: observed,
      before: snapshot,
      ...applied,
      posture: yield* ProjectionOutputPosture,
    });
  });
