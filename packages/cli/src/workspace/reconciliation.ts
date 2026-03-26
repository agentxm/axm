import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type {
  CommandLockEntry,
  Lockfile,
  McpServerLockEntry,
  PackLockEntry,
  SkillLockEntry,
} from "@axm.sh/core/unstable/lockfile";
import { LOCKFILE_NAME, writeLockfile } from "@axm.sh/core/unstable/lockfile";
import { commandReconciliationAdapter } from "../extensions/commands/reconciliation-adapter.js";
import { mcpServerReconciliationAdapter } from "../extensions/mcp-servers/reconciliation-adapter.js";
import { packReconciliationAdapter } from "../extensions/packs/reconciliation-adapter.js";
import { skillReconciliationAdapter } from "../extensions/skills/reconciliation-adapter.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationContext,
  ReconciliationDeclaration,
  ReconcileExtensionType,
} from "./reconciliation-types.js";
import type { OperationResult } from "./plan.js";

const adapters: ReadonlyArray<ReconciliationAdapter> = [
  skillReconciliationAdapter,
  commandReconciliationAdapter,
  mcpServerReconciliationAdapter,
  packReconciliationAdapter,
];

const reconcileTypeOrder: Readonly<Record<ReconcileExtensionType, number>> = {
  skills: 0,
  commands: 1,
  packs: 2,
  "mcp-servers": 3,
};

const dedupeDeclarationKey = (declaration: ReconciliationDeclaration): string =>
  `${declaration.extensionType}:${declaration.profile}:${declaration.name}:${declaration.declarationSourceOrConstraint}`;

const dedupeConflictKey = (declaration: ReconciliationDeclaration): string =>
  `${declaration.extensionType}:${declaration.profile}:${declaration.name}`;

export interface ReconciliationSnapshot {
  readonly lockfile: Lockfile;
  readonly unresolved: ReadonlyArray<{
    readonly declaration: ReconciliationDeclaration;
    readonly reason: "missing" | "invalid" | "declaration-mismatch";
  }>;
  readonly warnings: ReadonlyArray<string>;
}

const mergeReconstructed = (results: ReadonlyArray<DeclarationResolution>): Lockfile => {
  const skills: Record<string, SkillLockEntry> = {};
  const commands: Record<string, CommandLockEntry> = {};
  const mcpServers: Record<string, McpServerLockEntry> = {};
  const packs: Record<string, PackLockEntry> = {};

  for (const result of results) {
    if (result._tag !== "Compatible") {
      continue;
    }

    const reconstructed = result.reconstructed;

    switch (reconstructed.extensionType) {
      case "skills":
        skills[reconstructed.name] = reconstructed.entry;
        break;
      case "commands":
        commands[reconstructed.name] = reconstructed.entry;
        break;
      case "mcp-servers":
        mcpServers[reconstructed.name] = reconstructed.entry;
        break;
      case "packs":
        packs[reconstructed.name] = reconstructed.entry;
        break;
    }
  }

  return {
    lockfileVersion: 1,
    skills,
    commands,
    mcpServers,
    packs,
  } satisfies Lockfile;
};

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
    const byType = reconcileTypeOrder[a.extensionType] - reconcileTypeOrder[b.extensionType];
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
): Effect.Effect<ReconciliationSnapshot, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const scanResults = yield* Effect.forEach(
      adapters,
      (adapter) => adapter.scanDeclarations(context, { fs, path }),
      { concurrency: "unbounded" },
    );

    const scannedDeclarations = Array.flatten(scanResults.map((scan) => [...scan.declarations]));
    const scanWarnings = Array.flatten(scanResults.map((scan) => [...scan.warnings]));

    const deduped = dedupeDeclarations(scannedDeclarations);

    const checked = yield* Effect.forEach(
      deduped.declarations,
      (declaration) => {
        const adapter = adapters.find(
          (candidate) => candidate.extensionType === declaration.extensionType,
        );
        if (adapter === undefined) {
          return Effect.fail(
            makeAppError({
              code: "LOCKFILE_RECONCILE_ADAPTER_MISSING",
              what: `No reconciliation adapter for ${declaration.extensionType}`,
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

const formatUnresolved = (snapshot: ReconciliationSnapshot): ReadonlyArray<string> =>
  snapshot.unresolved.map(
    ({ declaration, reason }) =>
      `${declaration.extensionType}:${declaration.profile}/${declaration.name} (${reason})`,
  );

export const runReadRecoverOperation = (
  context: ReconciliationContext,
): Effect.Effect<OperationResult, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const snapshot = yield* buildReconciliationSnapshot(context);
    const unresolvedCount = snapshot.unresolved.length;
    // Optional lockfile sections default to empty for counting purposes.
    // The total represents all extension types found on disk during reconciliation.
    const reconstructedCount =
      Object.keys(snapshot.lockfile.skills).length +
      Object.keys(snapshot.lockfile.commands ?? {}).length +
      Object.keys(snapshot.lockfile.mcpServers ?? {}).length +
      Object.keys(snapshot.lockfile.packs ?? {}).length;

    const suffix = unresolvedCount > 0 ? `, ${unresolvedCount} unresolved` : "";
    return {
      result: "success",
      message: `Recovered ${reconstructedCount} declaration(s)${suffix}`,
    } satisfies OperationResult;
  });

const backupInvalidLockfile = (
  lockfilePath: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const timestamp = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
    const backupPath = path.join(path.dirname(lockfilePath), `${LOCKFILE_NAME}.bak.${stamp}`);

    yield* fs.rename(lockfilePath, backupPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "LOCKFILE_BACKUP_FAILED",
          what: `Failed to back up invalid lockfile to ${backupPath}`,
          cause: error,
        }),
      ),
    );
  });

export const runReconcileMaterializeOperation = (
  context: ReconciliationContext,
  lockfileDir: string,
  lockfileState: "missing" | "invalid",
  options?: {
    readonly allowMissingDeclarations?: boolean;
  },
): Effect.Effect<OperationResult, AppError, FileSystem.FileSystem | Path.Path> =>
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
          code: "LOCKFILE_RECONCILE_SOURCE_UNREACHABLE",
          what: "Required declaration sources are unreachable during reconciliation",
          details: formatUnresolved(snapshot),
        }),
      } satisfies OperationResult;
    }

    const lockfilePath = path.join(lockfileDir, LOCKFILE_NAME);
    if (lockfileState === "invalid") {
      const exists = yield* fs.exists(lockfilePath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "LOCKFILE_BACKUP_FAILED",
            what: `Failed to check invalid lockfile at ${lockfilePath}`,
            cause: error,
          }),
        ),
      );
      if (exists) {
        yield* backupInvalidLockfile(lockfilePath);
      }
    }

    yield* writeLockfile(lockfileDir, snapshot.lockfile);

    if (hasUnresolved) {
      return {
        result: "success",
        message: `Reconciled lockfile with ${snapshot.unresolved.length} missing declaration(s) deferred to install`,
      } satisfies OperationResult;
    }

    return {
      result: "success",
      message: "Reconciled and materialized lockfile",
    } satisfies OperationResult;
  });
