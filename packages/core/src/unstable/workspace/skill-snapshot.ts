/**
 * Read-only workspace skill snapshot for doctor and sync.
 *
 * Resolves declared skills, derives install state, and discovers configured
 * agent skill directories. This module does not plan or perform writes.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "../agents/index.js";
import { sanitizeName } from "../extensions/utils.js";
import { createDefaultSettings } from "../settings/index.js";
import { type SkillExtensionRef } from "../skills/index.js";
import { computeSkillPaths, type SkillPathSource } from "../skills/paths.js";
import { makeAbsolutePath } from "../utils/path-types.js";
import {
  resolveConfiguredSkill,
  toConfiguredEntryFailureReason,
  withConfiguredEntryResolutionTimeout,
  type ConfiguredEntryFailureReason,
} from "./configured-entry-resolution/index.js";
import { AgentRootResolverLive } from "./read-model/agent-root-resolver.js";
import { makeWorkspaceReadModel, WorkspaceReadModelConfig } from "./read-model/service.js";
import { getAxmDir } from "./paths.js";
import { WorkspaceMutations } from "./service-interface.js";

export interface WorkspaceResolvedSkill {
  readonly _tag: "resolved";
  readonly name: string;
  readonly source: string;
  readonly enabled: boolean;
  readonly ref: SkillExtensionRef;
  readonly canonicalPath: string;
  readonly skillSrcPath: string;
  readonly installed: boolean;
}

export interface WorkspaceUnresolvedSkill {
  readonly _tag: "unresolved";
  readonly name: string;
  readonly source: string;
  readonly enabled: boolean;
  readonly reason: ConfiguredEntryFailureReason;
}

export type WorkspaceSkillState = WorkspaceResolvedSkill | WorkspaceUnresolvedSkill;

export interface WorkspaceSkillAgentDirectory {
  readonly agentId: string;
  readonly dir: string;
}

export type WorkspaceSkillAgentIssue =
  | {
      readonly _tag: "unknown-agent";
      readonly agentId: string;
    }
  | {
      readonly _tag: "misconfigured-agent";
      readonly agentId: string;
      readonly reason: string;
    };

export interface WorkspaceSkillAgentSnapshot {
  readonly supportedDirs: ReadonlyArray<WorkspaceSkillAgentDirectory>;
  readonly issues: ReadonlyArray<WorkspaceSkillAgentIssue>;
}

export interface WorkspaceSkillSnapshot {
  readonly skills: ReadonlyArray<WorkspaceSkillState>;
  readonly agents: WorkspaceSkillAgentSnapshot;
}

const toSkillPathSource = (ref: SkillExtensionRef): SkillPathSource => {
  switch (ref.refType) {
    case "registry":
      return { refType: "registry", owner: ref.owner };
    case "local":
      return { refType: "local" };
    case "git-hosted":
      return { refType: "git-hosted" };
  }
};

const buildDeclaredSkillState = (
  baseDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
  source: string,
  enabled: boolean,
) =>
  Effect.gen(function* () {
    const resolved = yield* resolveConfiguredSkill(name, source).pipe(
      withConfiguredEntryResolutionTimeout(source),
      Effect.map(({ ref }) => ({ _tag: "resolved" as const, ref })),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: "unresolved" as const,
          reason: toConfiguredEntryFailureReason(error),
        }),
      ),
    );

    if (resolved._tag === "unresolved") {
      return {
        _tag: "unresolved",
        name,
        source,
        enabled,
        reason: resolved.reason,
      } satisfies WorkspaceUnresolvedSkill;
    }

    const { canonicalPath, skillSrcPath } = computeSkillPaths(
      path.join,
      baseDir,
      toSkillPathSource(resolved.ref),
      sanitizeName(resolved.ref.skill.name),
    );
    const installed = yield* fs.exists(canonicalPath).pipe(Effect.orElseSucceed(() => false));

    return {
      _tag: "resolved",
      name,
      source,
      enabled,
      ref: resolved.ref,
      canonicalPath,
      skillSrcPath,
      installed,
    } satisfies WorkspaceResolvedSkill;
  });

const buildDeclaredSkillSnapshot = (baseDir: string, fs: FileSystem.FileSystem, path: Path.Path) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const globalDir = yield* getAxmDir("user");
    const fsLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const contextEnv = Layer.mergeAll(
      fsLayer,
      Layer.succeed(WorkspaceReadModelConfig, {
        projectRoot: makeAbsolutePath(path, ws.baseDir),
        userHome: makeAbsolutePath(path, path.dirname(globalDir)),
        allowedRoot: makeAbsolutePath(path, "/"),
      }),
      AgentRootResolverLive.pipe(Layer.provide(fsLayer)),
    );
    const settings = yield* makeWorkspaceReadModel(ws.scope).pipe(
      Effect.flatMap((readModel) => readModel.state.settings),
      Effect.provide(contextEnv),
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
      Effect.orElseSucceed(() => createDefaultSettings()),
    );
    const normalizedSkills = Object.entries(settings.skills ?? {}).map(([name, entry]) => ({
      name,
      ...entry,
    }));

    return yield* Effect.forEach(
      normalizedSkills,
      ({ name, source, enabled }) =>
        buildDeclaredSkillState(baseDir, fs, path, name, source, enabled),
      { concurrency: "unbounded" },
    );
  });

const buildUnknownAgentIssue = (agentId: string): WorkspaceSkillAgentIssue => ({
  _tag: "unknown-agent",
  agentId,
});

const buildMisconfiguredAgentIssue = (
  agentId: string,
  reason: string,
): WorkspaceSkillAgentIssue => ({
  _tag: "misconfigured-agent",
  agentId,
  reason,
});

const buildWorkspaceSkillAgentSnapshot = (
  baseDir: string,
): Effect.Effect<
  WorkspaceSkillAgentSnapshot,
  never,
  CodingAgentRepository | Path.Path | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const agentRepo = yield* CodingAgentRepository;
    const path = yield* Path.Path;

    const configuredAgents = yield* agentRepo
      .getMaterializationAgents()
      .pipe(Effect.orElseSucceed(() => []));
    const unknownConfiguredAgentIds = yield* agentRepo
      .getUnknownConfiguredAgentIds()
      .pipe(Effect.orElseSucceed(() => []));

    const resolved = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: baseDir }).pipe(
          Effect.map((outcome) => ({ agentId: agent.id, outcome })),
          Effect.catch((error) =>
            Effect.succeed({
              agentId: agent.id,
              outcome: {
                _tag: "misconfigured" as const,
                reason: error.message,
              },
            }),
          ),
        ),
      { concurrency: "unbounded" },
    );

    const supportedDirs = resolved.flatMap(({ agentId, outcome }) =>
      outcome._tag === "supported"
        ? [
            {
              agentId,
              dir: path.normalize(outcome.dir),
            },
          ]
        : [],
    );

    const issues = [
      ...unknownConfiguredAgentIds.map(buildUnknownAgentIssue),
      ...resolved.flatMap(({ agentId, outcome }) =>
        outcome._tag === "supported" ? [] : [buildMisconfiguredAgentIssue(agentId, outcome.reason)],
      ),
    ];

    return {
      supportedDirs,
      issues,
    } satisfies WorkspaceSkillAgentSnapshot;
  });

export const isResolvedWorkspaceSkill = (
  skill: WorkspaceSkillState,
): skill is WorkspaceResolvedSkill => skill._tag === "resolved";

export const buildWorkspaceSkillSnapshot = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const skills = yield* buildDeclaredSkillSnapshot(ws.baseDir, fs, path);
    const agents = yield* buildWorkspaceSkillAgentSnapshot(ws.baseDir);

    return {
      skills,
      agents,
    } satisfies WorkspaceSkillSnapshot;
  });
