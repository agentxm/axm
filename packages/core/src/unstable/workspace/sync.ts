import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { commandReconciliationAdapter } from "../commands/reconciliation-adapter.js";
import { writeLockfile } from "../lockfile/index.js";
import { mcpServerReconciliationAdapter } from "../mcp-servers/reconciliation-adapter.js";
import { packReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import { createDefaultSettings, DEFAULT_PROFILE, readSettings } from "../settings/index.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import {
  buildReconciliationSnapshot,
  getReconciliationAdapters,
  setReconciliationAdapters,
  type ReconciliationSnapshot,
} from "./reconciliation.js";
import { Workspace } from "./service-interface.js";

export interface WorkspaceLockfileSyncReadiness {
  readonly canSync: boolean;
  readonly unresolvedCount: number;
  readonly unresolved: ReadonlyArray<string>;
}

interface SyncState {
  readonly workspacePath: string;
  readonly snapshot: ReconciliationSnapshot;
}

if (getReconciliationAdapters().length === 0) {
  setReconciliationAdapters([
    skillReconciliationAdapter,
    commandReconciliationAdapter,
    mcpServerReconciliationAdapter,
    packReconciliationAdapter,
  ]);
}

const makeFsLayer = (fs: FileSystem.FileSystem, path: Path.Path) =>
  Layer.mergeAll(Layer.succeed(FileSystem.FileSystem, fs), Layer.succeed(Path.Path, path));

const readSettingsSafe = (dir: string, fsLayer: Layer.Layer<FileSystem.FileSystem | Path.Path>) =>
  readSettings(dir).pipe(
    Effect.map(Option.getOrElse(() => createDefaultSettings())),
    Effect.provide(fsLayer),
  );

const countLockfileEntries = (lockfile: ReconciliationSnapshot["lockfile"]): number =>
  Object.keys(lockfile.skills).length +
  Object.keys(lockfile.commands ?? {}).length +
  Object.keys(lockfile.mcpServers ?? {}).length +
  Object.keys(lockfile.packs ?? {}).length;

const formatUnresolved = (snapshot: ReconciliationSnapshot) =>
  snapshot.unresolved.map(
    ({ declaration, reason }) =>
      `${declaration.extensionType}:${declaration.owner}/${declaration.name} (${reason})`,
  );

const buildWorkspaceSyncState = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fsLayer = makeFsLayer(fs, path);
    const settings = yield* readSettingsSafe(ws.path, fsLayer);
    const snapshot = yield* buildReconciliationSnapshot({
      baseDir: ws.baseDir,
      now: new Date(),
      defaultProfile: settings.profile ?? DEFAULT_PROFILE,
      agents: settings.agents ?? [],
      settings,
    }).pipe(Effect.provide(fsLayer));

    return {
      workspacePath: ws.path,
      snapshot,
    } satisfies SyncState;
  });

export const getWorkspaceLockfileSyncReadiness = () =>
  Effect.gen(function* () {
    const state = yield* buildWorkspaceSyncState();
    const unresolved = formatUnresolved(state.snapshot);
    return {
      canSync: unresolved.length === 0,
      unresolvedCount: unresolved.length,
      unresolved,
    } satisfies WorkspaceLockfileSyncReadiness;
  });

export const syncWorkspaceLockfile = () =>
  Effect.gen(function* () {
    const state = yield* buildWorkspaceSyncState();
    const unresolved = formatUnresolved(state.snapshot);

    if (unresolved.length > 0) {
      return yield* makeAppError({
        code: "WORKSPACE_SYNC_BLOCKED",
        what: "Cannot sync workspace while declarations are unresolved",
        details: unresolved,
        howToFix: "Restore the missing extension files or remove the stale settings entries first.",
      });
    }

    yield* writeLockfile(state.workspacePath, state.snapshot.lockfile);
    return countLockfileEntries(state.snapshot.lockfile);
  });
