import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { commandReconciliationAdapter } from "../commands/reconciliation-adapter.js";
import { countLockfileEntries, writeLockfile } from "../lockfile/index.js";
import { mcpServerReconciliationAdapter } from "../mcp-servers/reconciliation-adapter.js";
import { extensionPackReconciliationAdapter } from "../packs/reconciliation-adapter.js";
import { subagentReconciliationAdapter } from "../subagents/reconciliation-adapter.js";
import { createDefaultSettings, DEFAULT_PROFILE, readSettings } from "../settings/index.js";
import {
  ensureSkillAgentArtifact,
  materializeSkillCanonical,
  removeSkillAgentArtifact,
  type ProvideFs,
} from "../skills/materialization.js";
import { skillReconciliationAdapter } from "../skills/reconciliation-adapter.js";
import { sourceToLockEntry } from "../sources/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import {
  buildReconciliationSnapshot,
  getReconciliationAdapters,
  setReconciliationAdapters,
  type ReconciliationSnapshot,
} from "./reconciliation.js";
import {
  detectSettingsEntryBlockers,
  type SettingsEntryBlocker,
} from "./settings-validation/index.js";
import {
  buildWorkspaceSkillSnapshot,
  isResolvedWorkspaceSkill,
  type WorkspaceSkillAgentIssue,
} from "./skill-snapshot.js";
import { Workspace } from "./service-interface.js";

export interface WorkspaceSyncReadiness {
  readonly canSync: boolean;
  readonly blockers: ReadonlyArray<SettingsEntryBlocker>;
}

interface SyncState {
  readonly workspacePath: string;
  readonly snapshot: ReconciliationSnapshot;
}

if (getReconciliationAdapters().length === 0) {
  setReconciliationAdapters([
    skillReconciliationAdapter,
    commandReconciliationAdapter,
    subagentReconciliationAdapter,
    mcpServerReconciliationAdapter,
    extensionPackReconciliationAdapter,
  ]);
}

const makeFsLayer = (fs: FileSystem.FileSystem, path: Path.Path) =>
  Layer.mergeAll(Layer.succeed(FileSystem.FileSystem, fs), Layer.succeed(Path.Path, path));

const readSettingsSafe = (dir: string, fsLayer: Layer.Layer<FileSystem.FileSystem | Path.Path>) =>
  readSettings(dir).pipe(
    Effect.map(Option.getOrElse(() => createDefaultSettings())),
    Effect.provide(fsLayer),
  );

const buildLockfileSyncState = () =>
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

const formatWorkspaceSkillAgentIssue = (issue: WorkspaceSkillAgentIssue): string => {
  switch (issue._tag) {
    case "unknown-agent":
      return `${issue.agentId}: unknown agent`;
    case "misconfigured-agent":
      return `${issue.agentId}: ${issue.reason}`;
  }
};

export const formatWorkspaceSyncBlockersHowToFix = (
  blockers: ReadonlyArray<SettingsEntryBlocker>,
): string => {
  const [first, ...rest] = blockers;
  if (first !== undefined && rest.length === 0) {
    return first.hint;
  }
  return "Fix or remove the invalid or unresolved entries in settings.json first.";
};

export const getWorkspaceSyncReadiness = () =>
  Effect.gen(function* () {
    const blockers = yield* detectSettingsEntryBlockers();

    return {
      canSync: blockers.length === 0,
      blockers,
    } satisfies WorkspaceSyncReadiness;
  });

export const syncWorkspace = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const fsLayer = makeFsLayer(fs, path);
    const provide: ProvideFs = (effect) => Effect.provide(effect, fsLayer);
    const syncReadiness = yield* getWorkspaceSyncReadiness();

    if (!syncReadiness.canSync) {
      return yield* makeAppError({
        code: "WORKSPACE_SYNC_BLOCKED",
        what: "Cannot sync workspace while settings entries are invalid or unresolved",
        details: syncReadiness.blockers.map(
          (blocker) => `${blocker.subject.kind}:${blocker.subject.ref}: ${blocker.message}`,
        ),
        howToFix: formatWorkspaceSyncBlockersHowToFix(syncReadiness.blockers),
      });
    }

    const skillSnapshot = yield* buildWorkspaceSkillSnapshot();

    if (skillSnapshot.agents.issues.length > 0) {
      return yield* makeAppError({
        code: "WORKSPACE_SYNC_BLOCKED",
        what: "Cannot sync workspace while configured agent skill directories are unavailable",
        details: skillSnapshot.agents.issues.map(formatWorkspaceSkillAgentIssue),
        howToFix: "Fix the configured agent setup or remove unsupported agents from settings.json.",
      });
    }

    const resolvedSkills = skillSnapshot.skills.filter(isResolvedWorkspaceSkill);

    yield* Effect.forEach(
      resolvedSkills,
      (skill) =>
        materializeSkillCanonical({
          ref: skill.ref,
          sanitizedName: path.basename(skill.canonicalPath),
          fs,
          pathService: path,
          baseDir: ws.baseDir,
          sources,
          provide,
        }),
      { concurrency: "unbounded" },
    );

    yield* Effect.forEach(
      resolvedSkills,
      (skill) =>
        Effect.forEach(
          skillSnapshot.agents.supportedDirs,
          ({ dir }) =>
            skill.enabled
              ? ensureSkillAgentArtifact({
                  canonicalSkillSrcPath: skill.skillSrcPath,
                  targetDir: dir,
                  sanitizedName: path.basename(skill.canonicalPath),
                  pathService: path,
                  baseDir: ws.baseDir,
                  provide,
                })
              : removeSkillAgentArtifact({
                  fs,
                  pathService: path,
                  targetDir: dir,
                  sanitizedName: path.basename(skill.canonicalPath),
                }),
          { concurrency: "unbounded" },
        ),
      { concurrency: "unbounded" },
    );

    const lockfileState = yield* buildLockfileSyncState();
    const settings = yield* readSettingsSafe(ws.path, fsLayer);
    const configuredAgents = settings.agents ?? [];
    const synchronizedSkills = Object.fromEntries(
      resolvedSkills.map((skill) => [
        skill.name,
        sourceToLockEntry({
          ref: skill.ref,
          agents: skill.enabled ? configuredAgents : [],
          now: new Date(),
          sourceName: Option.none(),
          existingInstalledAt: Option.none(),
        }),
      ]),
    );

    const synchronizedLockfile = {
      ...lockfileState.snapshot.lockfile,
      skills: synchronizedSkills,
    };

    yield* writeLockfile(lockfileState.workspacePath, synchronizedLockfile);
    return countLockfileEntries(synchronizedLockfile);
  });
