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
import { buildWorkspaceSkillState, isResolvedWorkspaceSkill } from "./skill-state.js";
import { Workspace } from "./service-interface.js";

export interface WorkspaceSyncReadiness {
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

const formatUnresolvedSkills = () =>
  buildWorkspaceSkillState().pipe(
    Effect.map(({ skills }) =>
      skills
        .filter((skill) => skill._tag === "unresolved")
        .map((skill) => `${skill.name} (${skill.reason})`),
    ),
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

export const getWorkspaceSyncReadiness = () =>
  Effect.gen(function* () {
    const unresolved = yield* formatUnresolvedSkills();
    return {
      canSync: unresolved.length === 0,
      unresolvedCount: unresolved.length,
      unresolved,
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

    const skillState = yield* buildWorkspaceSkillState();
    const unresolved = skillState.skills
      .filter((skill) => skill._tag === "unresolved")
      .map((skill) => `${skill.name} (${skill.reason})`);

    if (unresolved.length > 0) {
      return yield* makeAppError({
        code: "WORKSPACE_SYNC_BLOCKED",
        what: "Cannot sync workspace while skill declarations are unresolved",
        details: unresolved,
        howToFix: "Fix the declared skill sources in settings.json first.",
      });
    }

    if (skillState.agentState.issues.length > 0) {
      return yield* makeAppError({
        code: "WORKSPACE_SYNC_BLOCKED",
        what: "Cannot sync workspace while configured agent skill directories are unavailable",
        details: skillState.agentState.issues,
        howToFix: "Fix the configured agent setup or remove unsupported agents from settings.json.",
      });
    }

    const resolvedSkills = skillState.skills.filter(isResolvedWorkspaceSkill);

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
          skillState.agentState.supportedDirs,
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
    const nonSkillUnresolved = lockfileState.snapshot.unresolved.filter(
      ({ declaration }) => declaration.type !== "skills",
    );

    if (nonSkillUnresolved.length > 0) {
      return yield* makeAppError({
        code: "WORKSPACE_SYNC_BLOCKED",
        what: "Cannot sync workspace while non-skill declarations are unresolved",
        details: nonSkillUnresolved.map(
          ({ declaration, reason }) =>
            `${declaration.type}:${declaration.owner}/${declaration.name} (${reason})`,
        ),
        howToFix: "Restore the missing extension files or remove the stale settings entries first.",
      });
    }

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
