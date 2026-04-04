import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { commandReconciliationAdapter } from "../commands/reconciliation-adapter.js";
import { readLockfile, type Lockfile } from "../lockfile/index.js";
import { mcpServerReconciliationAdapter } from "../mcp-servers/reconciliation-adapter.js";
import { packReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import {
  createDefaultSettings,
  DEFAULT_PROFILE,
  readSettings,
  type Settings,
} from "../settings/index.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import {
  buildReconciliationSnapshot,
  getReconciliationAdapters,
  setReconciliationAdapters,
  type ReconciliationSnapshot,
} from "./reconciliation.js";
import { Workspace } from "./service-interface.js";

export type WorkspaceDoctorCheckStatus = "pass" | "warn" | "fail" | "skip";

export interface WorkspaceDoctorCheck {
  readonly name: string;
  readonly status: WorkspaceDoctorCheckStatus;
  readonly message: string;
  readonly hint?: string;
}

export interface WorkspaceDoctorDiagnosis {
  readonly checks: ReadonlyArray<WorkspaceDoctorCheck>;
  readonly passed: number;
  readonly warned: number;
  readonly failed: number;
  readonly skipped: number;
  readonly canSync: boolean;
}

interface DoctorState {
  readonly scope: string;
  readonly workspacePath: string;
  readonly settings: Settings;
  readonly snapshot: ReconciliationSnapshot;
  readonly lockfileState: "ok" | "missing" | "invalid";
  readonly currentLockfile: Lockfile | undefined;
}

const DOCTOR_CHECK_NAMES = {
  lockfile: "Lockfile",
  declarations: "Declared Extensions on Disk",
  sync: "Settings/Lockfile Sync",
} as const;

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

const formatCountByType = (
  counts: ReadonlyArray<{ readonly type: string; readonly count: number }>,
) =>
  counts
    .filter((item) => item.count > 0)
    .map((item) => `${item.count} ${item.type}`)
    .join(", ");

const countMissingSettingsEntries = (settings: Settings, lockfile: Lockfile) => {
  const counts = [
    {
      type: "skills",
      count: Object.keys(settings.skills ?? {}).filter(
        (name) => lockfile.skills[name] === undefined,
      ).length,
    },
    {
      type: "commands",
      count: Object.keys(settings.commands ?? {}).filter(
        (name) => (lockfile.commands ?? {})[name] === undefined,
      ).length,
    },
    {
      type: "MCP servers",
      count: Object.keys(settings.mcpServers ?? {}).filter(
        (name) => (lockfile.mcpServers ?? {})[name] === undefined,
      ).length,
    },
    {
      type: "packs",
      count: Object.keys(settings.packs ?? {}).filter(
        (name) => (lockfile.packs ?? {})[name] === undefined,
      ).length,
    },
  ] as const;

  return {
    total: counts.reduce((sum, item) => sum + item.count, 0),
    details: formatCountByType(counts),
  };
};

const summarizeChecks = (
  checks: ReadonlyArray<WorkspaceDoctorCheck>,
): WorkspaceDoctorDiagnosis => ({
  checks,
  passed: checks.filter((check) => check.status === "pass").length,
  warned: checks.filter((check) => check.status === "warn").length,
  failed: checks.filter((check) => check.status === "fail").length,
  skipped: checks.filter((check) => check.status === "skip").length,
  canSync: false,
});

const buildDoctorState = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fsLayer = makeFsLayer(fs, path);
    const settings = yield* readSettingsSafe(ws.path, fsLayer);
    const lockfileState = yield* ws.getLockfileState();
    const currentLockfile =
      lockfileState === "ok"
        ? yield* readLockfile(ws.path).pipe(Effect.provide(fsLayer))
        : undefined;

    const snapshot = yield* buildReconciliationSnapshot({
      baseDir: ws.baseDir,
      now: new Date(),
      defaultProfile: settings.profile ?? DEFAULT_PROFILE,
      agents: settings.agents ?? [],
      settings,
    }).pipe(Effect.provide(fsLayer));

    return {
      scope: ws.scope,
      workspacePath: ws.path,
      settings,
      snapshot,
      lockfileState,
      currentLockfile,
    } satisfies DoctorState;
  });

export const diagnoseWorkspaceDoctor = () =>
  Effect.gen(function* () {
    const state = yield* buildDoctorState();

    const lockfileCheck: WorkspaceDoctorCheck =
      state.lockfileState === "ok"
        ? {
            name: DOCTOR_CHECK_NAMES.lockfile,
            status: "pass",
            message: "axm-lock.yaml is present and valid.",
          }
        : {
            name: DOCTOR_CHECK_NAMES.lockfile,
            status: "fail",
            message:
              state.lockfileState === "missing"
                ? "axm-lock.yaml is missing."
                : "axm-lock.yaml is invalid.",
            hint: "Run `axm sync` to reconcile workspace state from settings.json.",
          };

    const declarationCheck: WorkspaceDoctorCheck =
      state.snapshot.unresolved.length === 0
        ? {
            name: DOCTOR_CHECK_NAMES.declarations,
            status: "pass",
            message: "All settings-backed declarations were reconstructed from disk.",
          }
        : {
            name: DOCTOR_CHECK_NAMES.declarations,
            status: "fail",
            message: `${state.snapshot.unresolved.length} settings-backed declaration(s) could not be reconstructed from disk.`,
            hint: "Reinstall or restore the missing extension files before running `axm sync`.",
          };

    const syncCheck: WorkspaceDoctorCheck =
      state.currentLockfile === undefined
        ? {
            name: DOCTOR_CHECK_NAMES.sync,
            status: "skip",
            message: "Skipped because the lockfile is missing or invalid.",
          }
        : (() => {
            const missing = countMissingSettingsEntries(state.settings, state.currentLockfile);
            return missing.total === 0
              ? ({
                  name: DOCTOR_CHECK_NAMES.sync,
                  status: "pass",
                  message: "Every declaration in settings.json is present in axm-lock.yaml.",
                } satisfies WorkspaceDoctorCheck)
              : ({
                  name: DOCTOR_CHECK_NAMES.sync,
                  status: "fail",
                  message: `${missing.total} settings declaration(s) are missing from axm-lock.yaml${missing.details.length > 0 ? ` (${missing.details})` : ""}.`,
                  hint: "Run `axm sync` to reconcile workspace state from settings.json.",
                } satisfies WorkspaceDoctorCheck);
          })();

    const diagnosis = summarizeChecks([lockfileCheck, declarationCheck, syncCheck]);
    return {
      ...diagnosis,
      canSync: state.snapshot.unresolved.length === 0,
    } satisfies WorkspaceDoctorDiagnosis;
  });
