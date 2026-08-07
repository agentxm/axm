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
