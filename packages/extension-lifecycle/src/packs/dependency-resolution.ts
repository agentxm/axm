import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SourceAuthorityBlockedFact } from "@agentxm/extension-workspace";

/** Failures pack dependency resolution can surface. */
type PackDependencyResolutionError =
  SourceResolutionFailure | PackManagerError | SourceAuthorityBlocked;
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  Handle,
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import {
  formatFqn,
  parseFqnOrThrow,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { ResolvedPackDependencyMap } from "./resolved-dependency.js";
import type {
  SourceHostProvidersService,
  SourceResolutionFailure,
} from "@agentxm/extension-sources";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import {
  SourceAuthorityBlocked,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  type PackManagerError,
} from "@agentxm/extension-workspace";

import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { ExtensionDependencyConstraintMap } from "@agentxm/extension-model/unstable/extensions";
import type * as Duration from "effect/Duration";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import * as semver from "semver";
import type {
  ReleaseAgeBypassRecord,
  ReleaseAgeHoldbackRecord,
} from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import type {
  ReleaseAgeEvaluation,
  ReleaseAgeEvidence,
} from "@agentxm/extension-model/unstable/extensions/release-age";
import { releaseAgeExemptionForIdentity } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";

/** Every extension type a pack can depend on — packs cannot nest. */
type SupportedPackDependencyType = Exclude<ExtensionType, "pack">;

type PackDependencyRef = Extract<ExtensionRef, { readonly refType: "registry" | "workspace" }>;

type ResolvedDependency = {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly ref: PackDependencyRef;
};

export type WorkspacePackDependencyResolution =
  | { readonly kind: "absent" }
  | { readonly kind: "selected"; readonly ref: ExtensionRef }
  | { readonly kind: "blocked"; readonly fact: SourceAuthorityBlockedFact };

export type WorkspacePackDependencyResolver<E = never> = (args: {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly constraint: VersionRange;
  readonly root: string;
}) => Effect.Effect<WorkspacePackDependencyResolution, E>;

/** Resolve a Pack member from an already-authorized immutable candidate. */
export type PackDependencyRefResolver<E = never> = (args: {
  readonly owner: Handle;
  readonly type: SupportedPackDependencyType;
  readonly name: ExtensionName;
  readonly constraint: VersionRange;
  readonly root: string;
}) => Effect.Effect<ExtensionRef, E>;

const validateSelectedDependency = (
  candidate: ExtensionRef,
  expectedType: SupportedPackDependencyType,
  parsed: { readonly owner: Handle; readonly name: ExtensionName },
  fqn: string,
  constraint: VersionRange,
): Effect.Effect<ResolvedDependency, PackDependencyResolutionError> => {
  if (
    candidate.type !== expectedType ||
    (candidate.refType !== "registry" && candidate.refType !== "workspace") ||
    candidate.owner !== parsed.owner ||
    candidate.name !== parsed.name
  ) {
    return new PackDependencyConflict({
      detail: `Authorized dependency resolution does not match pack dependency ${fqn}`,
    });
  }
  if (!semver.satisfies(candidate.version, constraint)) {
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

const registrySourceForDependency = (
  pack: PackRef,
  owner: Handle,
  sourceOverride?: RegistrySource,
): Effect.Effect<RegistrySource, PackDependencyResolutionError> => {
  const source = sourceOverride ?? (pack.source.type === "registry" ? pack.source : undefined);
  if (source === undefined) {
    return Effect.fail(
      new PackDependencyInvalid({
        detail: `Cannot resolve pack dependencies from non-registry source`,
      }),
    );
  }

  return Effect.succeed({
    ...source,
    owner: Option.some(owner),
  });
};

const workspaceConstraintConflict = (
  pack: PackRef,
  memberFqn: string,
  workspaceVersion: string,
  constraint: VersionRange,
): PackConstraintShadowed =>
  new PackConstraintShadowed({
    packSource: pack.source.type === "workspace" ? "workspace" : "registry",
    packFqn: formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name }),
    memberFqn,
    constraint,
    workspaceVersion,
  });

const resolveDependencyRef = <E = never>(
  pack: PackRef,
  expectedType: SupportedPackDependencyType,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E>,
  dependencyResolver?: PackDependencyRefResolver<E>,
): Effect.Effect<ResolvedDependency, PackDependencyResolutionError | E> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type !== expectedType) {
      return yield* new PackDependencyInvalid({
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
    }

    if (workspaceResolver !== undefined) {
      const workspace = yield* workspaceResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        constraint,
        root: formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name }),
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
        return {
          owner: parsed.owner,
          type: expectedType,
          name: parsed.name,
          ref: candidate,
        };
      }
    }

    if (dependencyResolver !== undefined) {
      const candidate = yield* dependencyResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        constraint,
        root: formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name }),
      });
      return yield* validateSelectedDependency(candidate, expectedType, parsed, fqn, constraint);
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
      return yield* new PackDependencyInvalid({
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
      readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
      readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | { readonly kind: "policy_held"; readonly holdback: ReleaseAgeHoldbackRecord };

const dependencyReleaseAgeRecord = (args: {
  readonly packTarget: string;
  readonly dependencyTarget: string;
  readonly constraint: VersionRange;
  readonly evidence: ReleaseAgeEvidence;
  readonly selectedVersion?: string;
}): ReleaseAgeHoldbackRecord => ({
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

const resolveDependencyRefWithReleaseAge = <E = never>(
  pack: PackRef,
  expectedType: SupportedPackDependencyType,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
  evaluation: ReleaseAgeEvaluation,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E>,
  dependencyResolver?: PackDependencyRefResolver<E>,
): Effect.Effect<ReleaseAgeAwareDependencyResolution, PackDependencyResolutionError | E> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type !== expectedType) {
      return yield* new PackDependencyInvalid({
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
    }
    if (workspaceResolver !== undefined) {
      const workspace = yield* workspaceResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        constraint,
        root: formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name }),
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

    if (dependencyResolver !== undefined) {
      const candidate = yield* dependencyResolver({
        owner: parsed.owner,
        type: expectedType,
        name: parsed.name,
        constraint,
        root: formatFqn({ owner: pack.owner, type: "pack", name: pack.pack.name }),
      });
      return {
        kind: "selected",
        dependency: yield* validateSelectedDependency(
          candidate,
          expectedType,
          parsed,
          fqn,
          constraint,
        ),
        holdbacks: [],
        bypasses: [],
      };
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
      return yield* new PackDependencyMissing({ dependencyTarget });
    }
    if (resolution.kind === "version_unsatisfied") {
      return yield* new PackDependencyUnsatisfied({ dependencyTarget, constraint });
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
        resolution.kind === "exempted" || resolution.newerHeld === undefined
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
        resolution.kind === "selected"
          ? []
          : [
              {
                ...dependencyReleaseAgeRecord({
                  packTarget,
                  dependencyTarget,
                  constraint,
                  evidence: resolution.bypassed,
                  selectedVersion: ref.version,
                }),
                ...resolution.exemption,
              },
            ],
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

const resolveDependencyGroup = <E = never>(
  pack: PackRef,
  dependencies: ReadonlyArray<readonly [string, VersionRange]>,
  expectedType: SupportedPackDependencyType,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E>,
  dependencyResolver?: PackDependencyRefResolver<E>,
): Effect.Effect<ReadonlyArray<ResolvedDependency>, PackDependencyResolutionError | E> =>
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
        dependencyResolver,
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

export const resolvePackDependencies = <E = never>(
  pack: PackRef,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E>,
  dependencyResolver?: PackDependencyRefResolver<E>,
): Effect.Effect<ResolvedPackDependencies, PackDependencyResolutionError | E> =>
  Effect.gen(function* () {
    const dependencies = partitionDependencies(pack.pack.dependencies);
    if (dependencies.unsupported.length > 0) {
      return yield* new PackDependencyInvalid({
        detail: `Pack declares ${dependencies.unsupported.length} unsupported dependency type${dependencies.unsupported.length === 1 ? "" : "s"}: ${dependencies.unsupported.join(", ")}`,
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
        dependencyResolver,
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

export const resolvePackDependenciesWithReleaseAge = <E = never>(
  pack: PackRef,
  sources: SourceHostProvidersService,
  evaluation: ReleaseAgeEvaluation,
  sourceOverride?: RegistrySource,
  workspaceResolver?: WorkspacePackDependencyResolver<E>,
  dependencyResolver?: PackDependencyRefResolver<E>,
): Effect.Effect<ReleaseAgeAwarePackDependencyResolution, PackDependencyResolutionError | E> =>
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
          dependencyEvaluation,
          sourceOverride,
          workspaceResolver,
          dependencyResolver,
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
