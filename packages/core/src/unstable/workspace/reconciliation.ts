import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "../app-error/index.js";
import { count } from "../cli-renderer/index.js";
import type {
  HookLockEntry,
  KnowledgeLockEntry,
  Lockfile,
  McpServerLockEntry,
  PackLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import { LOCKFILE_NAME, LOCKFILE_VERSION, writeLockfile } from "../lockfile/index.js";
import type { DegradedLockfileState } from "./augment-plan.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationContext,
  ReconciliationDeclaration,
  ReconcileExtensionType,
  UnresolvedReason,
} from "./reconciliation-types.js";
import type { JobStepResult } from "../plan/plan.js";
import { isWorkspaceSourceLocator } from "../sources/index.js";
import { parseFqn } from "../extensions/index.js";
import * as Result from "effect/Result";
import { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";

export class ReconciliationAdapters extends ServiceMap.Service<
  ReconciliationAdapters,
  ReadonlyArray<ReconciliationAdapter>
>()("@agentxm/client-core/unstable/workspace/reconciliation/ReconciliationAdapters") {}

const reconcileTypeOrder: Readonly<Record<ReconcileExtensionType, number>> = {
  skills: 0,
  subagents: 1,
  packs: 2,
  mcps: 3,
  rules: 4,
  hooks: 5,
  knowledge: 6,
};

const dedupeDeclarationKey = (declaration: ReconciliationDeclaration): string =>
  `${declaration.type}:${declaration.owner}:${declaration.name}:${declaration.declarationSourceOrConstraint}`;

const dedupeConflictKey = (declaration: ReconciliationDeclaration): string =>
  `${declaration.type}:${declaration.owner}:${declaration.name}`;

const countReconstructedLockfileEntries = (lockfile: Lockfile): number =>
  Object.keys(lockfile.skills).length +
  Object.keys(lockfile.subagents ?? {}).length +
  Object.keys(lockfile.mcpServers ?? {}).length +
  Object.keys(lockfile.packs ?? {}).length +
  Object.keys(lockfile.rules ?? {}).length +
  Object.keys(lockfile.hooks ?? {}).length +
  Object.keys(lockfile.knowledge ?? {}).length;

export interface ReconciliationSnapshot {
  readonly lockfile: Lockfile;
  readonly unresolved: ReadonlyArray<{
    readonly declaration: ReconciliationDeclaration;
    readonly reason: UnresolvedReason;
  }>;
  readonly warnings: ReadonlyArray<string>;
}

const mergeReconstructed = (results: ReadonlyArray<DeclarationResolution>): Lockfile => {
  const skills: Record<string, SkillLockEntry> = {};
  const subagents: Record<string, SubagentLockEntry> = {};
  const mcpServers: Record<string, McpServerLockEntry> = {};
  const packs: Record<string, PackLockEntry> = {};
  const rules: Record<string, RuleLockEntry> = {};
  const hooks: Record<string, HookLockEntry> = {};
  const knowledge: Record<string, KnowledgeLockEntry> = {};

  for (const result of results) {
    if (result._tag !== "Compatible") {
      continue;
    }

    const reconstructed = result.reconstructed;

    switch (reconstructed.type) {
      case "skills":
        skills[reconstructed.name] = reconstructed.entry;
        break;
      case "subagents":
        subagents[reconstructed.name] = reconstructed.entry;
        break;
      case "mcps":
        mcpServers[reconstructed.name] = reconstructed.entry;
        break;
      case "packs":
        packs[reconstructed.name] = reconstructed.entry;
        break;
      case "rules":
        rules[reconstructed.name] = reconstructed.entry;
        break;
      case "hooks":
        hooks[reconstructed.name] = reconstructed.entry;
        break;
      case "knowledge":
        knowledge[reconstructed.name] = reconstructed.entry;
        break;
    }
  }

  return {
    lockfileVersion: LOCKFILE_VERSION,
    skills,
    subagents,
    mcpServers,
    packs,
    rules,
    hooks,
    knowledge,
  } satisfies Lockfile;
};

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const scanWorkspaceDeclarations = (context: ReconciliationContext) => {
  const groups = [
    ["skills", context.settings.skills],
    ["mcps", context.settings.mcpServers],
    ["subagents", context.settings.subagents],
    ["rules", context.settings.rules],
    ["hooks", context.settings.hooks],
    ["knowledge", context.settings.knowledge],
    ["packs", context.settings.packs],
  ] as const;
  const declarations: ReconciliationDeclaration[] = [];
  for (const [type, entries] of groups) {
    for (const [settingsName, entry] of Object.entries(entries ?? {})) {
      const source = entrySource(entry);
      if (source === undefined || !isWorkspaceSourceLocator(source)) continue;
      const parsed = parseFqn(source.slice("workspace:".length));
      if (Result.isFailure(parsed)) continue;
      declarations.push({
        type,
        owner: parsed.success.owner,
        name: parsed.success.name,
        source,
        declarationSourceOrConstraint: source,
        order: declarations.length,
        origin: "settings",
      });
      void settingsName;
    }
  }
  return declarations;
};

const reconstructWorkspaceDeclaration = (
  declaration: ReconciliationDeclaration,
  context: ReconciliationContext,
  env: { readonly fs: FileSystem.FileSystem; readonly path: Path.Path },
): Effect.Effect<DeclarationResolution, AppError> =>
  resolveWorkspaceExtensionRef({
    settingsName: declaration.name,
    source: declaration.source,
    expectedType:
      declaration.type === "mcps"
        ? "mcp-server"
        : declaration.type === "skills"
          ? "skill"
          : declaration.type === "subagents"
            ? "subagent"
            : declaration.type === "packs"
              ? "pack"
              : declaration.type === "rules"
                ? "rule"
                : declaration.type === "hooks"
                  ? "hook"
                  : "knowledge",
    baseDir: context.baseDir,
    scope: context.scope ?? "project",
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, env.fs),
    Effect.provideService(Path.Path, env.path),
    Effect.flatMap((ref): Effect.Effect<DeclarationResolution, AppError> => {
      const base = {
        type: "workspace" as const,
        owner: ref.owner,
        extensionType: ref.type,
        name: ref.name,
        version: ref.version,
        sourceHash: ref.sourceHash,
        installedAt: context.now,
        updatedAt: context.now,
      };
      switch (ref.type) {
        case "skill":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "skills",
              name: ref.name,
              entry: { ...base, extensionType: "skill", agents: context.agents },
            },
          });
        case "subagent":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "subagents",
              name: ref.name,
              entry: { ...base, extensionType: "subagent", agents: context.agents },
            },
          });
        case "mcp-server":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "mcps",
              name: ref.name,
              entry: { ...base, extensionType: "mcp-server" },
            },
          });
        case "rule":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "rules",
              name: ref.name,
              entry: { ...base, extensionType: "rule" },
            },
          });
        case "hook":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "hooks",
              name: ref.name,
              entry: { ...base, extensionType: "hook" },
            },
          });
        case "knowledge":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "knowledge",
              name: ref.name,
              entry: { ...base, extensionType: "knowledge" },
            },
          });
        case "pack":
          return Object.keys(ref.pack.dependencies).length === 0
            ? Effect.succeed({
                _tag: "Compatible",
                reconstructed: {
                  type: "packs",
                  name: ref.name,
                  entry: {
                    ...base,
                    extensionType: "pack",
                    resolvedSkills: {},
                    resolvedMcpServers: {},
                    resolvedSubagents: {},
                    resolvedRules: {},
                    resolvedHooks: {},
                    resolvedKnowledge: {},
                  },
                },
              })
            : Effect.succeed({
                _tag: "Unresolved",
                declaration,
                reason: "missing-registry-metadata",
              });
      }
    }),
  );

export const dedupeDeclarations = (
  declarations: ReadonlyArray<ReconciliationDeclaration>,
): {
  readonly declarations: ReadonlyArray<ReconciliationDeclaration>;
  readonly warnings: ReadonlyArray<string>;
} => {
  const byExactKey = new Map<string, ReconciliationDeclaration>();
  const byConflictKey = new Map<string, ReconciliationDeclaration>();
  const warnings: string[] = [];

  const ordered = [...declarations].sort((a, b) => {
    const byType = reconcileTypeOrder[a.type] - reconcileTypeOrder[b.type];
    if (byType !== 0) {
      return byType;
    }
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.declarationSourceOrConstraint.localeCompare(b.declarationSourceOrConstraint);
  });

  for (const declaration of ordered) {
    const key = dedupeDeclarationKey(declaration);
    if (byExactKey.has(key)) {
      continue;
    }

    const conflictKey = dedupeConflictKey(declaration);
    const existingConflict = byConflictKey.get(conflictKey);
    if (existingConflict !== undefined) {
      warnings.push(
        `LOCKFILE_RECONCILE_CONFLICT: ${conflictKey} (${existingConflict.declarationSourceOrConstraint} wins over ${declaration.declarationSourceOrConstraint})`,
      );
      continue;
    }

    byExactKey.set(key, declaration);
    byConflictKey.set(conflictKey, declaration);
  }

  return {
    declarations: [...byExactKey.values()],
    warnings,
  };
};

export const buildReconciliationSnapshot = (
  context: ReconciliationContext,
): Effect.Effect<
  ReconciliationSnapshot,
  AppError,
  FileSystem.FileSystem | Path.Path | ReconciliationAdapters
> =>
  Effect.gen(function* () {
    const adapters = yield* ReconciliationAdapters;
    // Resolve shared services once, then pass them into each adapter as an
    // explicit environment to keep the adapter interface narrow.
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const scanResults = yield* Effect.forEach(
      adapters,
      (adapter) => adapter.scanDeclarations(context, { fs, path }),
      { concurrency: "unbounded" },
    );

    const scannedDeclarations = [
      ...scanWorkspaceDeclarations(context),
      ...Array.flatten(scanResults.map((scan) => [...scan.declarations])),
    ];
    const scanWarnings = Array.flatten(scanResults.map((scan) => [...scan.warnings]));

    const deduped = dedupeDeclarations(scannedDeclarations);

    const checked = yield* Effect.forEach(
      deduped.declarations,
      (declaration) => {
        if (isWorkspaceSourceLocator(declaration.source)) {
          return reconstructWorkspaceDeclaration(declaration, context, { fs, path });
        }
        const adapter = adapters.find((candidate) => candidate.type === declaration.type);
        if (adapter === undefined) {
          return Effect.fail(
            makeAppError({
              code: "not_found",
              detail: `No reconciliation adapter for ${declaration.type}`,
            }),
          );
        }
        return adapter.resolveDeclaration(declaration, context, { fs, path });
      },
      { concurrency: "unbounded" },
    );

    return {
      lockfile: mergeReconstructed(checked),
      unresolved: checked
        .filter(
          (result): result is Extract<DeclarationResolution, { _tag: "Unresolved" }> =>
            result._tag === "Unresolved",
        )
        .map((result) => ({ declaration: result.declaration, reason: result.reason })),
      warnings: [...scanWarnings, ...deduped.warnings],
    };
  });

/**
 * Name the declarations reconciliation could not reconstruct, so a regenerated
 * lockfile never quietly looks complete.
 *
 * Registry-sourced entries always land here: a registry lock entry carries a
 * resolved version, integrity digest, source name, and publisher binding, none
 * of which survive a corrupt lockfile or exist in a fresh clone. They are
 * deferred to the next install rather than guessed at.
 */
const MAX_DEFERRED_NAMES_SHOWN = 5;

const describeDeferred = (snapshot: ReconciliationSnapshot): string => {
  const names = snapshot.unresolved.map(
    (entry) => `${entry.declaration.type}/${entry.declaration.name}`,
  );
  const shown = names.slice(0, MAX_DEFERRED_NAMES_SHOWN);
  const remainder = names.length - shown.length;
  const overflow = remainder > 0 ? `, +${remainder} more` : "";
  return `${shown.join(", ")}${overflow}`;
};

export const runReadRecoverOperation = (
  context: ReconciliationContext,
): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | ReconciliationAdapters
> =>
  Effect.gen(function* () {
    const snapshot = yield* buildReconciliationSnapshot(context);
    const unresolvedCount = snapshot.unresolved.length;
    const reconstructedCount = countReconstructedLockfileEntries(snapshot.lockfile);

    const suffix =
      unresolvedCount > 0
        ? `, ${count(unresolvedCount, "unresolved entry")} (${describeDeferred(snapshot)})`
        : "";
    return {
      result: "success",
      message: `Recovered ${count(reconstructedCount, "declaration")}${suffix}`,
    } satisfies JobStepResult;
  });

const backupInvalidLockfile = (
  lockfilePath: string,
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const tempDir = yield* fs.makeTempDirectory({ prefix: "axm-lockfile-backup-" }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: "Failed to create temporary directory for invalid lockfile backup",
          cause: error,
        }),
      ),
    );

    const backupPath = path.join(tempDir, LOCKFILE_NAME);

    yield* fs.copyFile(lockfilePath, backupPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to back up invalid lockfile to ${backupPath}`,
          cause: error,
        }),
      ),
    );

    yield* fs.remove(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to remove invalid lockfile after backing up to ${backupPath}`,
          cause: error,
        }),
      ),
    );

    return backupPath;
  });

export const runReconcileMaterializeOperation = (
  context: ReconciliationContext,
  lockfileDir: string,
  lockfileState: DegradedLockfileState,
  options?: {
    readonly allowMissingDeclarations?: boolean;
  },
): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | ReconciliationAdapters
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const snapshot = yield* buildReconciliationSnapshot(context);
    const allowMissingDeclarations = options?.allowMissingDeclarations ?? false;
    const hasUnresolved = snapshot.unresolved.length > 0;

    // Deferral, not failure: an unresolved declaration is one whose lock entry
    // cannot be rebuilt without registry metadata. Refusing to write the
    // lockfile at all would leave a corrupt or absent one in place — the very
    // state recovery exists to fix — so the entry is deferred to install and
    // named in the step message instead.
    if (hasUnresolved && !allowMissingDeclarations) {
      return {
        result: "error",
        message: "Reconciliation requires unresolved source resolution",
        error: makeAppError({
          code: "network",
          detail: "Required declaration sources are unreachable during reconciliation",
        }),
      } satisfies JobStepResult;
    }

    const lockfilePath = path.join(lockfileDir, LOCKFILE_NAME);
    let backupPath: string | undefined;
    if (lockfileState === "invalid") {
      const exists = yield* fs.exists(lockfilePath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to check invalid lockfile at ${lockfilePath}`,
            cause: error,
          }),
        ),
      );
      if (exists) {
        backupPath = yield* backupInvalidLockfile(lockfilePath);
      }
    }

    // Receipt recovery must not erase a valid dedicated trust baseline. The
    // regenerated receipt is optional operational history and may be partial
    // when declarations require remote resolution.
    yield* writeLockfile(lockfileDir, snapshot.lockfile, { preserveTrust: true });

    const backupNote =
      backupPath === undefined ? "" : ` (backed up invalid lockfile to ${backupPath})`;

    // Surfaced as step warnings, not only in the message, so the backup location
    // and anything dropped from the regenerated lockfile stay visible at default
    // verbosity instead of only under `--verbose`.
    const warnings = [
      ...(backupPath === undefined ? [] : [`Backed up the unreadable lockfile to ${backupPath}`]),
      ...(hasUnresolved
        ? [
            `${count(snapshot.unresolved.length, "declaration")} could not be pinned and is deferred to install: ${describeDeferred(snapshot)}`,
          ]
        : []),
    ];

    if (hasUnresolved) {
      return {
        result: "success",
        message: `Reconciled lockfile; ${count(snapshot.unresolved.length, "declaration")} deferred to install (${describeDeferred(snapshot)})${backupNote}`,
        warnings,
      } satisfies JobStepResult;
    }

    return {
      result: "success",
      message: `Reconciled and materialized lockfile${backupNote}`,
      warnings,
    } satisfies JobStepResult;
  });
