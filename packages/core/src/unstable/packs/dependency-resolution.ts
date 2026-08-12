import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { count } from "../cli-renderer/index.js";
import type { ExtensionRef, Handle, ExtensionName, ExtensionType } from "../extensions/index.js";
import { formatFqn, parseFqnOrThrow, toExtensionTypePlural } from "../extensions/index.js";
import type { ResolvedExtensionMap } from "../lockfile/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { RegistrySource } from "../sources/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { PackRef } from "./refs.js";
import type { ExtensionDependencyConstraintMap } from "../extensions/index.js";
import type * as Duration from "effect/Duration";
import type { VersionRange } from "../version-constraints/version-constraints.js";
import * as semver from "semver";
import type {
  ReleaseAgeEvaluation,
  ReleaseAgeEvidence,
  ReleaseAgeRecord,
} from "../registry/index.js";

/** Every extension type a pack can depend on — packs cannot nest. */
type SupportedPackDependencyType = Exclude<ExtensionType, "pack">;

type PackDependencyRef = Extract<ExtensionRef, { readonly refType: "registry" | "workspace" }>;

type ResolvedDependency = {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly ref: PackDependencyRef;
};

export type WorkspacePackDependencyResolver = (args: {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
}) => Effect.Effect<Option.Option<ExtensionRef>, AppError>;

export interface ResolvedPackDependencies {
  readonly resolvedSkills: ResolvedExtensionMap;
  readonly resolvedMcpServers: ResolvedExtensionMap;
  readonly resolvedSubagents: ResolvedExtensionMap;
  readonly resolvedRules: ResolvedExtensionMap;
  readonly resolvedHooks: ResolvedExtensionMap;
  readonly resolvedKnowledge: ResolvedExtensionMap;
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

export type ReleaseAgeAwarePackDependencyResolution =
  | {
      readonly kind: "selected";
      readonly dependencies: ResolvedPackDependencies;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeRecord>;
    }
  | {
      readonly kind: "policy_held";
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeRecord>;
    };

const registrySourceForDependency = (
  pack: PackRef,
  owner: Handle,
  sourceOverride?: RegistrySource,
): Effect.Effect<RegistrySource, AppError> => {
  const source = sourceOverride ?? (pack.source.type === "registry" ? pack.source : undefined);
  if (source === undefined) {
    return Effect.fail(
      makeAppError({
        code: "usage",
        detail: `Cannot resolve pack dependencies from non-registry source`,
      }),
    );
  }

  return Effect.succeed({
    ...source,
    owner: Option.some(owner),
  });
};

const resolveDependencyRef = (
  pack: PackRef,
  expectedType: SupportedPackDependencyType,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver,
): Effect.Effect<ResolvedDependency, AppError> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type !== expectedType) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
    }

    if (workspaceResolver !== undefined) {
      const workspace = yield* workspaceResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
      });
      if (Option.isSome(workspace)) {
        const candidate = workspace.value;
        if (
          candidate.type !== expectedType ||
          candidate.refType !== "workspace" ||
          candidate.owner !== parsed.owner ||
          candidate.name !== parsed.name
        ) {
          return yield* makeAppError({
            code: "conflict",
            detail: `Configured workspace authority does not match pack dependency ${fqn}`,
          });
        }
        if (!semver.satisfies(candidate.version, constraint)) {
          return yield* makeAppError({
            code: "conflict",
            detail: `Workspace dependency ${fqn}@${candidate.version} does not satisfy ${constraint}`,
          });
        }
        return {
          owner: parsed.owner,
          type: expectedType,
          name: parsed.name,
          ref: candidate,
        };
      }
    }

    const source = yield* registrySourceForDependency(pack, parsed.owner, sourceOverride);
    const matches = yield* Effect.scoped(
      sources.find(source, {
        names: [parsed.name],
        type: expectedType,
        owner: Option.some(parsed.owner),
        versionRange: Option.some<string>(constraint),
        ...(minimumReleaseAge === undefined ? {} : { minimumReleaseAge }),
      }),
    );

    const matchingRef = matches.find(
      (candidate): candidate is Extract<ExtensionRef, { readonly refType: "registry" }> =>
        candidate.type === expectedType &&
        candidate.refType === "registry" &&
        candidate.owner === parsed.owner &&
        candidate.name === parsed.name,
    );

    if (matchingRef === undefined) {
      return yield* makeAppError({
        code: "usage",
        detail: `Unable to resolve pack dependency ${fqn}@${constraint}`,
      });
    }

    return {
      owner: parsed.owner,
      type: expectedType,
      name: parsed.name,
      ref: matchingRef,
    };
  });

type ReleaseAgeAwareDependencyResolution =
  | {
      readonly kind: "selected";
      readonly dependency: ResolvedDependency;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeRecord>;
    }
  | { readonly kind: "policy_held"; readonly holdback: ReleaseAgeRecord };

const dependencyReleaseAgeRecord = (args: {
  readonly packTarget: string;
  readonly dependencyTarget: string;
  readonly constraint: VersionRange;
  readonly evidence: ReleaseAgeEvidence;
  readonly selectedVersion?: string;
}): ReleaseAgeRecord => ({
  reason: "minimum-release-age",
  target: args.dependencyTarget,
  dependencyPath: [args.packTarget, args.dependencyTarget],
  requestedRange: args.constraint,
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

const resolveDependencyRefWithReleaseAge = (
  pack: PackRef,
  expectedType: SupportedPackDependencyType,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
  evaluation: ReleaseAgeEvaluation,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver,
): Effect.Effect<ReleaseAgeAwareDependencyResolution, AppError> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type !== expectedType) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
    }
    if (workspaceResolver !== undefined) {
      const workspace = yield* workspaceResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
      });
      if (Option.isSome(workspace)) {
        const candidate = workspace.value;
        if (
          candidate.type !== expectedType ||
          candidate.refType !== "workspace" ||
          candidate.owner !== parsed.owner ||
          candidate.name !== parsed.name
        ) {
          return yield* makeAppError({
            code: "conflict",
            detail: `Configured workspace authority does not match pack dependency ${fqn}`,
          });
        }
        if (!semver.satisfies(candidate.version, constraint)) {
          return yield* makeAppError({
            code: "conflict",
            detail: `Workspace dependency ${fqn}@${candidate.version} does not satisfy ${constraint}`,
          });
        }
        return {
          kind: "selected",
          dependency: {
            owner: parsed.owner,
            type: expectedType,
            name: parsed.name,
            ref: candidate,
          },
          holdbacks: [],
          bypasses: [],
        };
      }
    }

    const source = yield* registrySourceForDependency(pack, parsed.owner, sourceOverride);
    const resolution = yield* Effect.scoped(
      sources.resolveNamedRegistry(source, {
        name: parsed.name,
        type: expectedType,
        owner: parsed.owner,
        versionRange: Option.some<string>(constraint),
        releaseAgeEvaluation: evaluation,
      }),
    );
    const packTarget = formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name });
    const dependencyTarget = formatFqn(parsed);
    if (resolution.kind === "not_found") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Pack dependency ${dependencyTarget} was not found`,
      });
    }
    if (resolution.kind === "version_unsatisfied") {
      return yield* makeAppError({
        code: "conflict",
        title: "No compatible version",
        detail: `Pack dependency ${dependencyTarget} has no visible version satisfying ${constraint}`,
      });
    }
    if (resolution.kind === "policy_held") {
      return {
        kind: "policy_held",
        holdback: dependencyReleaseAgeRecord({
          packTarget,
          dependencyTarget,
          constraint,
          evidence: resolution.candidate,
        }),
      };
    }
    const ref = resolution.ref;
    return {
      kind: "selected",
      dependency: {
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        ref,
      },
      holdbacks:
        resolution.newerHeld === undefined
          ? []
          : [
              dependencyReleaseAgeRecord({
                packTarget,
                dependencyTarget,
                constraint,
                evidence: resolution.newerHeld,
                selectedVersion: ref.version,
              }),
            ],
      bypasses:
        resolution.bypassed === undefined
          ? []
          : [
              dependencyReleaseAgeRecord({
                packTarget,
                dependencyTarget,
                constraint,
                evidence: resolution.bypassed,
                selectedVersion: ref.version,
              }),
            ],
    };
  });

const toResolvedMap = (dependencies: ReadonlyArray<ResolvedDependency>): ResolvedExtensionMap =>
  Object.fromEntries(
    dependencies.map((dependency) => {
      const ref = dependency.ref;
      return [
        formatFqn(dependency),
        ref.refType === "registry"
          ? {
              source: "registry" as const,
              version: ref.version,
              publisherBindingId: ref.publisherBindingId,
              integrity: Option.getOrElse(ref.integrity, () => ""),
            }
          : {
              source: "workspace" as const,
              version: ref.version,
              sourceIdentity: `workspace:${ref.owner}/${toExtensionTypePlural(ref.type)}/${ref.name}`,
              contentIdentity: ref.sourceHash,
            },
      ];
    }),
  );

const resolveDependencyGroup = (
  pack: PackRef,
  dependencies: ReadonlyArray<readonly [string, VersionRange]>,
  expectedType: SupportedPackDependencyType,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver,
): Effect.Effect<ReadonlyArray<ResolvedDependency>, AppError> =>
  Effect.forEach(
    dependencies,
    ([fqn, constraint]) =>
      resolveDependencyRef(
        pack,
        expectedType,
        fqn,
        constraint,
        sources,
        minimumReleaseAge,
        sourceOverride,
        workspaceResolver,
      ),
    { concurrency: "unbounded" },
  );

/**
 * Group dependency FQNs by extension type.
 *
 * The `groups` record is keyed by every non-pack extension type, so a new type
 * fails compile here rather than being silently dropped from pack membership.
 */
const partitionDependencies = (dependencies: ExtensionDependencyConstraintMap) => {
  const groups: Record<SupportedPackDependencyType, Array<readonly [string, VersionRange]>> = {
    skill: [],
    "mcp-server": [],
    subagent: [],
    rule: [],
    hook: [],
    knowledge: [],
  };
  const unsupported: string[] = [];

  for (const [fqn, constraint] of Object.entries(dependencies)) {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type === "pack") {
      unsupported.push(fqn);
      continue;
    }
    groups[parsed.type].push([fqn, constraint]);
  }

  return { groups, unsupported };
};

export const resolvePackDependencies = (
  pack: PackRef,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver,
): Effect.Effect<ResolvedPackDependencies, AppError> =>
  Effect.gen(function* () {
    const dependencies = partitionDependencies(pack.pack.dependencies);
    if (dependencies.unsupported.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack declares ${count(dependencies.unsupported.length, "unsupported dependency type")}: ${dependencies.unsupported.join(", ")}`,
      });
    }

    const resolveGroup = <T extends SupportedPackDependencyType>(type: T) =>
      resolveDependencyGroup(
        pack,
        dependencies.groups[type],
        type,
        sources,
        minimumReleaseAge,
        sourceOverride,
        workspaceResolver,
      );

    const resolvedSkills = yield* resolveGroup("skill");
    const resolvedMcpServers = yield* resolveGroup("mcp-server");
    const resolvedSubagents = yield* resolveGroup("subagent");
    const resolvedRules = yield* resolveGroup("rule");
    const resolvedHooks = yield* resolveGroup("hook");
    const resolvedKnowledge = yield* resolveGroup("knowledge");

    return {
      resolvedSkills: toResolvedMap(resolvedSkills),
      resolvedMcpServers: toResolvedMap(resolvedMcpServers),
      resolvedSubagents: toResolvedMap(resolvedSubagents),
      resolvedRules: toResolvedMap(resolvedRules),
      resolvedHooks: toResolvedMap(resolvedHooks),
      resolvedKnowledge: toResolvedMap(resolvedKnowledge),
      dependencyRefs: [
        ...resolvedSkills,
        ...resolvedMcpServers,
        ...resolvedSubagents,
        ...resolvedRules,
        ...resolvedHooks,
        ...resolvedKnowledge,
      ].map((dependency) => dependency.ref),
    };
  });

export const resolvePackDependenciesWithReleaseAge = (
  pack: PackRef,
  sources: SourceHostProvidersService,
  evaluation: ReleaseAgeEvaluation,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver,
): Effect.Effect<ReleaseAgeAwarePackDependencyResolution, AppError> =>
  Effect.gen(function* () {
    const dependencies = partitionDependencies(pack.pack.dependencies);
    if (dependencies.unsupported.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack declares ${count(dependencies.unsupported.length, "unsupported dependency type")}: ${dependencies.unsupported.join(", ")}`,
      });
    }
    const entries = [
      ...dependencies.groups.skill.map(([fqn, constraint]) => ({
        type: "skill" as const,
        fqn,
        constraint,
      })),
      ...dependencies.groups["mcp-server"].map(([fqn, constraint]) => ({
        type: "mcp-server" as const,
        fqn,
        constraint,
      })),
      ...dependencies.groups.subagent.map(([fqn, constraint]) => ({
        type: "subagent" as const,
        fqn,
        constraint,
      })),
      ...dependencies.groups.rule.map(([fqn, constraint]) => ({
        type: "rule" as const,
        fqn,
        constraint,
      })),
      ...dependencies.groups.hook.map(([fqn, constraint]) => ({
        type: "hook" as const,
        fqn,
        constraint,
      })),
      ...dependencies.groups.knowledge.map(([fqn, constraint]) => ({
        type: "knowledge" as const,
        fqn,
        constraint,
      })),
    ];
    const resolutions = yield* Effect.forEach(
      entries,
      ({ type, fqn, constraint }) =>
        resolveDependencyRefWithReleaseAge(
          pack,
          type,
          fqn,
          constraint,
          sources,
          evaluation,
          sourceOverride,
          workspaceResolver,
        ),
      { concurrency: "unbounded" },
    );
    const holdbacks = resolutions.flatMap((resolution) =>
      resolution.kind === "policy_held" ? [resolution.holdback] : resolution.holdbacks,
    );
    const bypasses = resolutions.flatMap((resolution) =>
      resolution.kind === "selected" ? resolution.bypasses : [],
    );
    if (resolutions.some((resolution) => resolution.kind === "policy_held")) {
      return { kind: "policy_held", holdbacks, bypasses };
    }
    const selected = resolutions.flatMap((resolution) =>
      resolution.kind === "selected" ? [resolution.dependency] : [],
    );
    const byType = <T extends SupportedPackDependencyType>(type: T) =>
      selected.filter((dependency) => dependency.type === type);
    const resolvedSkills = byType("skill");
    const resolvedMcpServers = byType("mcp-server");
    const resolvedSubagents = byType("subagent");
    const resolvedRules = byType("rule");
    const resolvedHooks = byType("hook");
    const resolvedKnowledge = byType("knowledge");
    return {
      kind: "selected",
      holdbacks,
      bypasses,
      dependencies: {
        resolvedSkills: toResolvedMap(resolvedSkills),
        resolvedMcpServers: toResolvedMap(resolvedMcpServers),
        resolvedSubagents: toResolvedMap(resolvedSubagents),
        resolvedRules: toResolvedMap(resolvedRules),
        resolvedHooks: toResolvedMap(resolvedHooks),
        resolvedKnowledge: toResolvedMap(resolvedKnowledge),
        dependencyRefs: selected.map((dependency) => dependency.ref),
      },
    };
  });
