/**
 * Pack dependency resolution: every declared member resolved to one exact
 * identity under the pack's constraints, workspace authority, and the
 * minimum-release-age policy.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as semver from "semver";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  ExtensionName,
  ExtensionType,
  Handle,
  PackMemberConstraintMap,
  PackMemberRegistrySource,
} from "@agentxm/extension-model/unstable/extensions";
import {
  formatFqn,
  parseFqnOrThrow,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { RegistrySource, Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { SourceHostProvidersService, SourceResolutionFailure } from "./sources/index.js";
import { desiredStateProblemText, type DesiredConstraintConflict } from "../desired-state/index.js";

import {
  AcceptedPackMemberIncompatible,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
  type PackDependencyResolutionFailure,
} from "./errors.js";
import {
  releaseAgeExemptionForIdentity,
  releaseAgeRecord,
  releaseAgeRecords,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
} from "./release-age-policy.js";
import type { ResolvedPackDependencyMap } from "./resolved-pack-dependency.js";
import type { SourceAuthorityBlockedFact } from "./source-authority.js";

/** Failures pack dependency resolution can surface. */
type PackDependencyResolutionError =
  | SourceResolutionFailure
  | PackDependencyResolutionFailure
  | SourceAuthorityBlocked
  | AcceptedPackMemberIncompatible;

/** Every extension type a pack can depend on — packs cannot nest. */
type SupportedPackDependencyType = Exclude<ExtensionType, "pack">;

type PackDependencyRef = Extract<ExtensionRef, { readonly type: SupportedPackDependencyType }>;

type ResolvedDependency = {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly ref: PackDependencyRef;
};

type PartitionedDependency = readonly [
  fqn: string,
  constraint: VersionRange,
  source: PackMemberRegistrySource | undefined,
];

const explicitRegistrySource = (
  source: PackMemberRegistrySource,
  owner: Handle,
): RegistrySource => ({
  type: "registry",
  name: source.url.href,
  location: source.url,
  owner: Option.some(owner),
});

export type WorkspacePackDependencyResolution =
  | { readonly kind: "absent" }
  | { readonly kind: "selected"; readonly ref: ExtensionRef }
  | { readonly kind: "blocked"; readonly fact: SourceAuthorityBlockedFact };

export type WorkspacePackDependencyResolver<E = never, R = never> = (args: {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly constraint: VersionRange;
  readonly root: string;
}) => Effect.Effect<WorkspacePackDependencyResolution, E, R>;

/**
 * The range a declared member is selected within. Planners answer with the
 * desired-state graph's effective constraint for the member, of which this
 * Pack's declared range is one contributor, so a Pack never selects a member
 * version another contributor excludes; a conflict refuses the Pack.
 */
export type PackMemberRangeResolver = (member: {
  readonly type: SupportedPackDependencyType;
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly declared: VersionRange;
}) => Result.Result<VersionRange, DesiredConstraintConflict>;

const memberSelectionRange = (
  memberRange: PackMemberRangeResolver | undefined,
  fqn: string,
  declared: VersionRange,
): Effect.Effect<VersionRange, PackDependencyConflict> => {
  if (memberRange === undefined) return Effect.succeed(declared);
  const parsed = parseFqnOrThrow(fqn);
  if (parsed.type === "pack") return Effect.succeed(declared);
  const selected = memberRange({
    type: parsed.type,
    owner: parsed.owner,
    name: parsed.name,
    declared,
  });
  return Result.isSuccess(selected)
    ? Effect.succeed(selected.success)
    : Effect.fail(
        new PackDependencyConflict({ detail: desiredStateProblemText(selected.failure) }),
      );
};

/** Resolve a Pack member from an already-authorized immutable candidate. */
export type PackDependencyRefResolver<E = never, R = never> = (args: {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly constraint: VersionRange;
  readonly root: string;
}) => Effect.Effect<ExtensionRef, E, R>;

const validateSelectedDependency = (
  candidate: ExtensionRef,
  expectedType: SupportedPackDependencyType,
  parsed: { readonly owner: Handle; readonly name: ExtensionName },
  fqn: string,
  constraint: VersionRange,
): Effect.Effect<ResolvedDependency, PackDependencyResolutionError> => {
  if (
    candidate.type !== expectedType ||
    candidate.owner !== parsed.owner ||
    candidate.name !== parsed.name
  ) {
    return new PackDependencyConflict({
      detail: `Authorized dependency resolution does not match pack dependency ${fqn}`,
    });
  }
  if (
    (candidate.refType === "registry" || candidate.refType === "workspace") &&
    !semver.satisfies(candidate.version, constraint)
  ) {
    return new PackDependencyConflict({
      detail: `Authorized dependency ${fqn}@${candidate.version} does not satisfy ${constraint}`,
    });
  }
  return Effect.succeed({
    owner: parsed.owner,
    type: expectedType,
    name: parsed.name,
    ref: candidate,
  });
};

export interface ResolvedPackDependencies {
  readonly resolvedSkills: ResolvedPackDependencyMap;
  readonly resolvedMcpServers: ResolvedPackDependencyMap;
  readonly resolvedSubagents: ResolvedPackDependencyMap;
  readonly resolvedRules: ResolvedPackDependencyMap;
  readonly resolvedHooks: ResolvedPackDependencyMap;
  readonly resolvedKnowledge: ResolvedPackDependencyMap;
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

export type ReleaseAgeAwarePackDependencyResolution =
  | {
      readonly kind: "selected";
      readonly dependencies: ResolvedPackDependencies;
      readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | {
      readonly kind: "policy_held";
      readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    };

const sourceForDependency = (
  pack: PackRef,
  owner: Handle,
  sourceOverride?: RegistrySource,
): Effect.Effect<Source, PackDependencyResolutionError> => {
  const source = sourceOverride ?? (pack.source.type === "workspace" ? undefined : pack.source);
  if (source === undefined) {
    return Effect.fail(
      new PackDependencyInvalid({
        detail: `Cannot inherit a source for workspace Pack dependencies`,
      }),
    );
  }

  return Effect.succeed(
    source.type === "registry" ? { ...source, owner: Option.some(owner) } : source,
  );
};

const workspaceConstraintConflict = (
  pack: PackRef,
  memberFqn: string,
  workspaceVersion: string,
  constraint: VersionRange,
): PackConstraintShadowed =>
  new PackConstraintShadowed({
    packSource:
      pack.refType === "git-hosted" ? "git" : pack.refType === "local" ? "local" : pack.refType,
    packFqn: formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name }),
    memberFqn,
    constraint,
    workspaceVersion,
  });

type ReleaseAgeAwareDependencyResolution =
  | {
      readonly kind: "selected";
      readonly dependency: ResolvedDependency;
      readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | { readonly kind: "policy_held"; readonly holdback: ReleaseAgeHoldbackRecord };

const selectedWithoutReleaseAge = (
  dependency: ResolvedDependency,
): ReleaseAgeAwareDependencyResolution => ({
  kind: "selected",
  dependency,
  holdbacks: [],
  bypasses: [],
});

/**
 * Resolve one declared member: configured workspace authority first, then an
 * already-authorized candidate, then the member the Pack's own Git or local
 * source carries, and otherwise the member's Registry under the operation's
 * release-age evaluation. This is the only member resolver; a source without
 * release dates contributes no release-age evidence.
 */
const resolveDependencyRefWithReleaseAge = <E = never, R = never>(
  pack: PackRef,
  expectedType: SupportedPackDependencyType,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
  evaluation: ReleaseAgeEvaluation,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E, R>,
  dependencyResolver?: PackDependencyRefResolver<E, R>,
): Effect.Effect<ReleaseAgeAwareDependencyResolution, PackDependencyResolutionError | E, R> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type !== expectedType) {
      return yield* new PackDependencyInvalid({
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
    }
    const root = formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name });
    if (workspaceResolver !== undefined) {
      const workspace = yield* workspaceResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        constraint,
        root,
      });
      if (workspace.kind === "blocked") {
        return yield* new SourceAuthorityBlocked({
          detail: workspace.fact.detail,
          recovery: workspace.fact.recovery,
        });
      }
      if (workspace.kind === "selected") {
        const candidate = workspace.ref;
        if (
          candidate.type !== expectedType ||
          candidate.refType !== "workspace" ||
          candidate.owner !== parsed.owner ||
          candidate.name !== parsed.name
        ) {
          return yield* new PackDependencyConflict({
            detail: `Configured workspace authority does not match pack dependency ${fqn}`,
          });
        }
        if (!semver.satisfies(candidate.version, constraint)) {
          return yield* workspaceConstraintConflict(pack, fqn, candidate.version, constraint);
        }
        return selectedWithoutReleaseAge({
          owner: parsed.owner,
          type: expectedType,
          name: parsed.name,
          ref: candidate,
        });
      }
    }

    if (dependencyResolver !== undefined) {
      const candidate = yield* dependencyResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        constraint,
        root,
      });
      // The accepted resolution is the member's authority, so one outside the
      // range it is selected within is a decision for an explicit update.
      if (
        (candidate.refType === "registry" || candidate.refType === "workspace") &&
        candidate.type === expectedType &&
        candidate.owner === parsed.owner &&
        candidate.name === parsed.name &&
        !semver.satisfies(candidate.version, constraint)
      ) {
        return yield* new AcceptedPackMemberIncompatible({
          type: expectedType,
          name: parsed.name,
          dependencyTarget: formatFqn(parsed),
          acceptedVersion: candidate.version,
          constraint,
        });
      }
      return selectedWithoutReleaseAge(
        yield* validateSelectedDependency(candidate, expectedType, parsed, fqn, constraint),
      );
    }

    if (
      sourceOverride === undefined &&
      (pack.refType === "git-hosted" || pack.refType === "local")
    ) {
      const matches = pack.sourceMembers.filter(
        (candidate) =>
          candidate.type === expectedType &&
          candidate.owner === parsed.owner &&
          candidate.name === parsed.name,
      );
      const candidate = matches[0];
      if (candidate === undefined || matches.length !== 1) {
        return yield* new PackDependencyInvalid({
          detail:
            matches.length === 0
              ? `Unable to resolve source-inherited pack dependency ${fqn}`
              : `Pack dependency ${fqn} is ambiguous in the Pack source`,
        });
      }
      return selectedWithoutReleaseAge(
        yield* validateSelectedDependency(candidate, expectedType, parsed, fqn, constraint),
      );
    }

    const source = yield* sourceForDependency(pack, parsed.owner, sourceOverride);
    if (source.type !== "registry") {
      const matches = yield* Effect.scoped(
        sources.find(source, {
          names: [parsed.name],
          type: expectedType,
          owner: Option.some(parsed.owner),
          versionRange: Option.none<string>(),
        }),
      );
      const matchingRef = matches.find(
        (candidate): candidate is PackDependencyRef =>
          candidate.type === expectedType &&
          candidate.owner === parsed.owner &&
          candidate.name === parsed.name,
      );
      if (matchingRef === undefined) {
        return yield* new PackDependencyInvalid({
          detail: `Unable to resolve pack dependency ${fqn}@${constraint}`,
        });
      }
      return selectedWithoutReleaseAge({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        ref: matchingRef,
      });
    }
    const resolution = yield* Effect.scoped(
      sources.resolveNamedRegistry(source, {
        name: parsed.name,
        type: expectedType,
        owner: parsed.owner,
        versionRange: Option.some<string>(constraint),
        releaseAgeEvaluation: evaluation,
      }),
    );
    const dependencyTarget = formatFqn(parsed);
    const subject = {
      target: dependencyTarget,
      dependencyPath: [root, dependencyTarget],
      requestedRange: constraint,
    };
    if (resolution.kind === "not_found") {
      return yield* new PackDependencyMissing({ dependencyTarget });
    }
    if (resolution.kind === "version_unsatisfied") {
      return yield* new PackDependencyUnsatisfied({ dependencyTarget, constraint });
    }
    if (resolution.kind === "policy_held") {
      return { kind: "policy_held", holdback: releaseAgeRecord(subject, resolution.candidate) };
    }
    const dependency = yield* validateSelectedDependency(
      resolution.ref,
      expectedType,
      parsed,
      fqn,
      constraint,
    );
    return {
      kind: "selected",
      dependency,
      ...releaseAgeRecords(subject, resolution, resolution.ref.version),
    };
  });

const toResolvedMap = (
  dependencies: ReadonlyArray<ResolvedDependency>,
): ResolvedPackDependencyMap =>
  Object.fromEntries(
    dependencies.map((dependency) => {
      const ref = dependency.ref;
      return [
        formatFqn(dependency),
        (() => {
          switch (ref.refType) {
            case "registry":
              return {
                source: "registry" as const,
                version: ref.version,
                publisherBindingId: ref.publisherBindingId,
                integrity: Option.getOrElse(ref.integrity, () => ""),
              };
            case "workspace":
              return {
                source: "workspace" as const,
                version: ref.version,
                sourceIdentity: `workspace:${ref.owner}/${toExtensionTypePlural(ref.type)}/${ref.name}`,
                contentIdentity: ref.sourceHash,
              };
            case "git-hosted":
              return {
                source: "git" as const,
                commit: ref.gitCommitSha,
                tree: ref.gitTreeSha,
              };
            case "local":
              return { source: "local" as const };
          }
        })(),
      ];
    }),
  );

/**
 * Group dependency FQNs by extension type.
 *
 * The `groups` record is keyed by every non-pack extension type, so a new type
 * fails compile here rather than being silently dropped from pack membership.
 */
const partitionDependencies = (dependencies: PackMemberConstraintMap) => {
  const groups: Record<SupportedPackDependencyType, Array<PartitionedDependency>> = {
    skill: [],
    "mcp-server": [],
    subagent: [],
    rule: [],
    hook: [],
    knowledge: [],
  };
  const unsupported: string[] = [];

  for (const [fqn, declaration] of Object.entries(dependencies)) {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type === "pack") {
      unsupported.push(fqn);
      continue;
    }
    groups[parsed.type].push([
      fqn,
      typeof declaration === "string" ? declaration : declaration.versionRange,
      typeof declaration === "string" ? undefined : declaration.source,
    ]);
  }

  return { groups, unsupported };
};

export const resolvePackDependenciesWithReleaseAge = <E = never, R = never>(
  pack: PackRef,
  sources: SourceHostProvidersService,
  evaluation: ReleaseAgeEvaluation,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E, R>,
  dependencyResolver?: PackDependencyRefResolver<E, R>,
  memberRange?: PackMemberRangeResolver,
): Effect.Effect<ReleaseAgeAwarePackDependencyResolution, PackDependencyResolutionError | E, R> =>
  Effect.gen(function* () {
    const packExemption =
      pack.refType === "registry"
        ? releaseAgeExemptionForIdentity(evaluation, {
            owner: pack.owner,
            type: "pack",
            name: pack.pack.name,
          })
        : undefined;
    const dependencyEvaluation =
      packExemption?.bypassCause === "exclude"
        ? { ...evaluation, grantedExemption: packExemption }
        : evaluation;
    const dependencies = partitionDependencies(pack.pack.dependencies);
    if (dependencies.unsupported.length > 0) {
      return yield* new PackDependencyInvalid({
        detail: `Pack declares ${dependencies.unsupported.length} unsupported dependency type${dependencies.unsupported.length === 1 ? "" : "s"}: ${dependencies.unsupported.join(", ")}`,
      });
    }
    const entries = [
      ...dependencies.groups.skill.map(([fqn, constraint, source]) => ({
        type: "skill" as const,
        fqn,
        constraint,
        source,
      })),
      ...dependencies.groups["mcp-server"].map(([fqn, constraint, source]) => ({
        type: "mcp-server" as const,
        fqn,
        constraint,
        source,
      })),
      ...dependencies.groups.subagent.map(([fqn, constraint, source]) => ({
        type: "subagent" as const,
        fqn,
        constraint,
        source,
      })),
      ...dependencies.groups.rule.map(([fqn, constraint, source]) => ({
        type: "rule" as const,
        fqn,
        constraint,
        source,
      })),
      ...dependencies.groups.hook.map(([fqn, constraint, source]) => ({
        type: "hook" as const,
        fqn,
        constraint,
        source,
      })),
      ...dependencies.groups.knowledge.map(([fqn, constraint, source]) => ({
        type: "knowledge" as const,
        fqn,
        constraint,
        source,
      })),
    ];
    const resolutions = yield* Effect.forEach(
      entries,
      (entry) =>
        memberSelectionRange(memberRange, entry.fqn, entry.constraint).pipe(
          Effect.flatMap((constraint) =>
            resolveDependencyRefWithReleaseAge(
              pack,
              entry.type,
              entry.fqn,
              constraint,
              sources,
              dependencyEvaluation,
              entry.source === undefined
                ? sourceOverride
                : explicitRegistrySource(entry.source, parseFqnOrThrow(entry.fqn).owner),
              workspaceResolver,
              dependencyResolver,
            ),
          ),
        ),
      { concurrency: 16 },
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
