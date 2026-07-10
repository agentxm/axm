import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "../app-error/index.js";
import { count } from "../cli-renderer/index.js";
import type {
  CommandLockEntry,
  FilesLockEntry,
  HookLockEntry,
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
import { resolveWorkspacePackMembers } from "../packs/manager.js";

export class ReconciliationAdapters extends ServiceMap.Service<
  ReconciliationAdapters,
  ReadonlyArray<ReconciliationAdapter>
>()("@agentxm/client-core/unstable/workspace/reconciliation/ReconciliationAdapters") {}

const reconcileTypeOrder: Readonly<Record<ReconcileExtensionType, number>> = {
  skills: 0,
  commands: 1,
  subagents: 2,
  packs: 3,
  mcps: 4,
  files: 5,
  rules: 6,
  hooks: 7,
};

const dedupeDeclarationKey = (declaration: ReconciliationDeclaration): string =>
  `${declaration.type}:${declaration.owner}:${declaration.name}:${declaration.declarationSourceOrConstraint}`;

const dedupeConflictKey = (declaration: ReconciliationDeclaration): string =>
  `${declaration.type}:${declaration.owner}:${declaration.name}`;

const countReconstructedLockfileEntries = (lockfile: Lockfile): number =>
  Object.keys(lockfile.skills).length +
  Object.keys(lockfile.commands ?? {}).length +
  Object.keys(lockfile.subagents ?? {}).length +
  Object.keys(lockfile.mcpServers ?? {}).length +
  Object.keys(lockfile.packs ?? {}).length +
  Object.keys(lockfile.files ?? {}).length +
  Object.keys(lockfile.rules ?? {}).length +
  Object.keys(lockfile.hooks ?? {}).length;

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
  const commands: Record<string, CommandLockEntry> = {};
  const subagents: Record<string, SubagentLockEntry> = {};
  const mcpServers: Record<string, McpServerLockEntry> = {};
  const packs: Record<string, PackLockEntry> = {};
  const files: Record<string, FilesLockEntry> = {};
  const rules: Record<string, RuleLockEntry> = {};
  const hooks: Record<string, HookLockEntry> = {};

  for (const result of results) {
    if (result._tag !== "Compatible") {
      continue;
    }

    const reconstructed = result.reconstructed;

    switch (reconstructed.type) {
      case "skills":
        skills[reconstructed.name] = reconstructed.entry;
        break;
      case "commands":
        commands[reconstructed.name] = reconstructed.entry;
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
      case "files":
        files[reconstructed.name] = reconstructed.entry;
        break;
      case "rules":
        rules[reconstructed.name] = reconstructed.entry;
        break;
      case "hooks":
        hooks[reconstructed.name] = reconstructed.entry;
        break;
    }
  }

  return {
    lockfileVersion: LOCKFILE_VERSION,
    skills,
    commands,
    subagents,
    mcpServers,
    packs,
    files,
    rules,
    hooks,
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
    ["commands", context.settings.commands],
    ["mcps", context.settings.mcpServers],
    ["subagents", context.settings.subagents],
    ["files", context.settings.files],
    ["rules", context.settings.rules],
    ["hooks", context.settings.hooks],
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
          : declaration.type === "commands"
            ? "command"
            : declaration.type === "subagents"
              ? "subagent"
              : declaration.type === "packs"
                ? "pack"
                : declaration.type === "rules"
                  ? "rule"
                  : declaration.type === "hooks"
                    ? "hook"
                    : "files",
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
        case "command":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "commands",
              name: ref.name,
              entry: { ...base, extensionType: "command", agents: context.agents },
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
        case "files":
          return Effect.succeed({
            _tag: "Compatible",
            reconstructed: {
              type: "files",
              name: ref.name,
              entry: { ...base, extensionType: "files" },
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
        case "pack":
          return resolveWorkspacePackMembers(ref, env.fs, env.path, context.baseDir).pipe(
            Effect.map((resolved) => ({
              _tag: "Compatible",
              reconstructed: {
                type: "packs",
                name: ref.name,
                entry: {
                  ...base,
                  extensionType: "pack",
                  ...resolved,
                },
              },
            })),
          );
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
        return adapter.checkDiskCompatibility(declaration, context, { fs, path });
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

    const suffix = unresolvedCount > 0 ? `, ${count(unresolvedCount, "unresolved entry")}` : "";
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
    const hasNonMissingUnresolved = snapshot.unresolved.some((entry) => entry.reason !== "missing");

    if (hasUnresolved && (!allowMissingDeclarations || hasNonMissingUnresolved)) {
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

    yield* writeLockfile(lockfileDir, snapshot.lockfile);

    const backupNote =
      backupPath === undefined ? "" : ` (backed up invalid lockfile to ${backupPath})`;

    if (hasUnresolved) {
      return {
        result: "success",
        message: `Reconciled lockfile with ${count(snapshot.unresolved.length, "missing declaration")} deferred to install${backupNote}`,
      } satisfies JobStepResult;
    }

    return {
      result: "success",
      message: `Reconciled and materialized lockfile${backupNote}`,
    } satisfies JobStepResult;
  });
