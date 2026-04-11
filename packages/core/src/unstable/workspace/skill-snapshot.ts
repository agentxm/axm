/**
 * Read-only workspace skill snapshot for doctor and sync.
 *
 * Resolves declared skills, derives install state, and discovers configured
 * agent skill directories. This module does not plan or perform writes.
 */
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "../agents/index.js";
import { sanitizeName } from "../extensions/utils.js";
import { createDefaultSettings, normalizeSkillEntry, readSettings } from "../settings/index.js";
import { type FindOptions, parseInputPattern } from "../sources/index.js";
import {
  type SourceHostProvidersService,
  resolveSource,
  SourceHostProviders,
} from "../source-resolution/index.js";
import { type SkillExtensionRef } from "../skills/index.js";
import { computeSkillPaths, type SkillPathSource } from "../skills/paths.js";
import { Workspace } from "./service-interface.js";

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

export type WorkspaceUnresolvedSkillReason =
  | {
      readonly _tag: "multiple-matches";
    }
  | {
      readonly _tag: "timeout";
    }
  | {
      readonly _tag: "skill-not-found";
    }
  | {
      readonly _tag: "resolution-failed";
      readonly message: string;
    };

export interface WorkspaceUnresolvedSkill {
  readonly _tag: "unresolved";
  readonly name: string;
  readonly source: string;
  readonly enabled: boolean;
  readonly reason: WorkspaceUnresolvedSkillReason;
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

const SKILL_RESOLUTION_TIMEOUT = "2 seconds";

const multipleMatchesReason = (): WorkspaceUnresolvedSkillReason => ({
  _tag: "multiple-matches",
});

const timeoutReason = (): WorkspaceUnresolvedSkillReason => ({
  _tag: "timeout",
});

const skillNotFoundReason = (): WorkspaceUnresolvedSkillReason => ({
  _tag: "skill-not-found",
});

const resolutionFailedReason = (message: string): WorkspaceUnresolvedSkillReason => ({
  _tag: "resolution-failed",
  message,
});

const makeFsLayer = (fs: FileSystem.FileSystem, path: Path.Path) =>
  Layer.mergeAll(Layer.succeed(FileSystem.FileSystem, fs), Layer.succeed(Path.Path, path));

const readSettingsSafe = (dir: string, fsLayer: Layer.Layer<FileSystem.FileSystem | Path.Path>) =>
  readSettings(dir).pipe(
    Effect.map(Option.getOrElse(() => createDefaultSettings())),
    Effect.provide(fsLayer),
  );

const resolveSkillRef = (
  name: string,
  source: string,
  providers: SourceHostProvidersService,
): Effect.Effect<
  SkillExtensionRef,
  WorkspaceUnresolvedSkillReason,
  Workspace | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const parsed = parseInputPattern(source);
    const owner =
      Option.isSome(parsed) &&
      parsed.value.pattern.pattern === "registry-pattern-input" &&
      Option.isSome(parsed.value.pattern.type) &&
      parsed.value.pattern.type.value === "skills"
        ? Option.some(parsed.value.pattern.owner)
        : Option.none();
    const versionConstraint =
      Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input"
        ? parsed.value.pattern.versionConstraint
        : Option.none<string>();

    const expectedNames = Array.dedupe([
      name,
      ...(Option.isSome(parsed) &&
      parsed.value.pattern.pattern === "registry-pattern-input" &&
      Option.isSome(parsed.value.pattern.name)
        ? [parsed.value.pattern.name.value]
        : []),
    ]);

    const sourceRef = yield* resolveSource(source).pipe(
      Effect.mapError((error) => resolutionFailedReason(error.what)),
    );

    const findSkills = (skillNames: ReadonlyArray<string>) =>
      providers
        .find(sourceRef, {
          skillNames,
          type: "skill",
          owner,
          versionConstraint,
        } satisfies FindOptions)
        .pipe(
          Effect.scoped,
          Effect.map((refs) =>
            refs.filter((ref): ref is SkillExtensionRef => ref.type === "skill"),
          ),
          Effect.mapError((error) => resolutionFailedReason(error.what)),
        );

    const directMatches = yield* findSkills(expectedNames);
    if (directMatches.length === 1) {
      const [match] = directMatches;
      if (match !== undefined) return match;
    }

    if (directMatches.length > 1) {
      return yield* Effect.fail(multipleMatchesReason());
    }

    const discovered = yield* findSkills([]);
    const matchingDiscovered = discovered.filter((ref) => expectedNames.includes(ref.skill.name));

    if (matchingDiscovered.length === 1) {
      const [match] = matchingDiscovered;
      if (match !== undefined) return match;
    }

    if (discovered.length === 1) {
      const [onlyMatch] = discovered;
      if (onlyMatch !== undefined) return onlyMatch;
    }

    return yield* Effect.fail(skillNotFoundReason());
  }).pipe(
    Effect.timeoutOrElse({
      duration: SKILL_RESOLUTION_TIMEOUT,
      orElse: () => Effect.fail(timeoutReason()),
    }),
  );

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
  providers: SourceHostProvidersService,
  name: string,
  source: string,
  enabled: boolean,
): Effect.Effect<WorkspaceSkillState, never, Workspace | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const resolved = yield* resolveSkillRef(name, source, providers).pipe(
      Effect.map((ref) => ({ _tag: "resolved" as const, ref })),
      Effect.catch((reason) =>
        Effect.succeed({
          _tag: "unresolved" as const,
          reason,
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

const buildDeclaredSkillSnapshot = (
  baseDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  providers: SourceHostProvidersService,
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fsLayer = makeFsLayer(fs, path);
    const settings = yield* readSettingsSafe(ws.path, fsLayer);
    const normalizedSkills = Object.entries(settings.skills ?? {}).map(([name, entry]) => ({
      name,
      ...normalizeSkillEntry(entry),
    }));

    return yield* Effect.forEach(
      normalizedSkills,
      ({ name, source, enabled }) =>
        buildDeclaredSkillState(baseDir, fs, path, providers, name, source, enabled),
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
  CodingAgentRepository | Path.Path | Workspace
> =>
  Effect.gen(function* () {
    const agentRepo = yield* CodingAgentRepository;
    const path = yield* Path.Path;

    const configuredAgents = yield* agentRepo
      .getConfiguredAgents()
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
                reason: error.what,
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
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const providers = yield* SourceHostProviders;

    const skills = yield* buildDeclaredSkillSnapshot(ws.baseDir, fs, path, providers);
    const agents = yield* buildWorkspaceSkillAgentSnapshot(ws.baseDir);

    return {
      skills,
      agents,
    } satisfies WorkspaceSkillSnapshot;
  });
