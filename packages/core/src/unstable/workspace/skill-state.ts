import * as Array from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
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

export interface WorkspaceUnresolvedSkill {
  readonly _tag: "unresolved";
  readonly name: string;
  readonly source: string;
  readonly enabled: boolean;
  readonly reason: string;
}

export type WorkspaceSkillState = WorkspaceResolvedSkill | WorkspaceUnresolvedSkill;

export interface WorkspaceSkillAgentState {
  readonly supportedDirs: ReadonlyArray<{
    readonly agentId: string;
    readonly dir: string;
  }>;
  readonly issues: ReadonlyArray<string>;
}

export interface WorkspaceSkillStateSnapshot {
  readonly skills: ReadonlyArray<WorkspaceSkillState>;
  readonly agentState: WorkspaceSkillAgentState;
}

const SKILL_RESOLUTION_TIMEOUT = "2 seconds";

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
): Effect.Effect<SkillExtensionRef, string, Workspace | FileSystem.FileSystem | Path.Path> =>
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

    const sourceRef = yield* resolveSource(source).pipe(Effect.mapError((error) => error.what));

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
          Effect.mapError((error) => error.what),
        );

    const directMatches = yield* findSkills(expectedNames);
    if (directMatches.length === 1) {
      const [match] = directMatches;
      if (match !== undefined) return match;
    }

    if (directMatches.length > 1) {
      return yield* Effect.fail(
        `Multiple skills matched "${name}" from ${source}. Narrow the declaration to one skill.`,
      );
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

    return yield* Effect.fail(`No skill named "${name}" could be resolved from ${source}.`);
  }).pipe(
    Effect.timeoutOrElse({
      duration: SKILL_RESOLUTION_TIMEOUT,
      orElse: () => Effect.fail(`Timed out while resolving "${name}" from ${source}.`),
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

const buildSkillState = (
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

const buildAgentState = (
  baseDir: string,
): Effect.Effect<WorkspaceSkillAgentState, never, CodingAgentRepository | Path.Path | Workspace> =>
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
      ...unknownConfiguredAgentIds.map((agentId) => `${agentId}: unknown agent`),
      ...resolved.flatMap(({ agentId, outcome }) =>
        outcome._tag === "supported" ? [] : [`${agentId}: ${outcome.reason}`],
      ),
    ];

    return {
      supportedDirs,
      issues,
    } satisfies WorkspaceSkillAgentState;
  });

export const isResolvedWorkspaceSkill = (
  skill: WorkspaceSkillState,
): skill is WorkspaceResolvedSkill => skill._tag === "resolved";

export const buildWorkspaceSkillState = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const providers = yield* SourceHostProviders;
    const fsLayer = makeFsLayer(fs, path);
    const settings = yield* readSettingsSafe(ws.path, fsLayer);
    const normalizedSkills = Object.entries(settings.skills ?? {}).map(([name, entry]) => ({
      name,
      ...normalizeSkillEntry(entry),
    }));

    const skills = yield* Effect.forEach(
      normalizedSkills,
      ({ name, source, enabled }) =>
        buildSkillState(ws.baseDir, fs, path, providers, name, source, enabled),
      { concurrency: "unbounded" },
    );
    const agentState = yield* buildAgentState(ws.baseDir);

    return {
      skills,
      agentState,
    } satisfies WorkspaceSkillStateSnapshot;
  });
