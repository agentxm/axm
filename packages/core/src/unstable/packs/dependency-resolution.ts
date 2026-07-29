import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { count } from "../cli-renderer/index.js";
import type { ExtensionRef, Handle, ExtensionName, ExtensionType } from "../extensions/index.js";
import { formatFqn, parseFqnOrThrow } from "../extensions/index.js";
import type { ResolvedExtensionMap } from "../lockfile/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { RegistrySource } from "../sources/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { PackRef } from "./refs.js";
import type { ExtensionDependencyConstraintMap } from "../extensions/index.js";
import type * as Duration from "effect/Duration";
import type { VersionRange } from "../version-constraints/version-constraints.js";

type ResolvedDependency<T extends ExtensionType = ExtensionType> = {
  readonly owner: Handle;
  readonly type: T;
  readonly name: ExtensionName;
  readonly ref: Extract<ExtensionRef, { readonly refType: "registry"; readonly type: T }>;
  readonly source: RegistrySource;
};

export interface ResolvedPackDependencies {
  readonly resolvedSkills: ResolvedExtensionMap;
  readonly resolvedCommands: ResolvedExtensionMap;
  readonly resolvedMcpServers: ResolvedExtensionMap;
  readonly resolvedSubagents: ResolvedExtensionMap;
  readonly resolvedFiles: ResolvedExtensionMap;
  readonly resolvedRules: ResolvedExtensionMap;
  readonly resolvedHooks: ResolvedExtensionMap;
  readonly resolvedKnowledge: ResolvedExtensionMap;
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

/** Every extension type a pack can depend on — packs cannot nest. */
type SupportedPackDependencyType = Exclude<ExtensionType, "pack">;

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

const resolveDependencyRef = <T extends ExtensionType>(
  pack: PackRef,
  expectedType: T,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
): Effect.Effect<ResolvedDependency<T>, AppError> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    if (parsed.type !== expectedType) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
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
      (
        candidate,
      ): candidate is Extract<ExtensionRef, { readonly refType: "registry"; readonly type: T }> =>
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
      source,
    };
  });

const toResolvedMap = <T extends ExtensionType>(
  dependencies: ReadonlyArray<ResolvedDependency<T>>,
): ResolvedExtensionMap =>
  Object.fromEntries(
    dependencies.map((dependency) => [
      formatFqn(dependency),
      {
        version: dependency.ref.version,
        publisherBindingId: dependency.ref.publisherBindingId,
      },
    ]),
  );

const resolveDependencyGroup = <T extends SupportedPackDependencyType>(
  pack: PackRef,
  dependencies: ReadonlyArray<readonly [string, VersionRange]>,
  expectedType: T,
  sources: SourceHostProvidersService,
  minimumReleaseAge?: Option.Option<Duration.Duration>,
  sourceOverride?: RegistrySource,
): Effect.Effect<ReadonlyArray<ResolvedDependency<T>>, AppError> =>
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
    command: [],
    "mcp-server": [],
    subagent: [],
    files: [],
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
      );

    const resolvedSkills = yield* resolveGroup("skill");
    const resolvedCommands = yield* resolveGroup("command");
    const resolvedMcpServers = yield* resolveGroup("mcp-server");
    const resolvedSubagents = yield* resolveGroup("subagent");
    const resolvedFiles = yield* resolveGroup("files");
    const resolvedRules = yield* resolveGroup("rule");
    const resolvedHooks = yield* resolveGroup("hook");
    const resolvedKnowledge = yield* resolveGroup("knowledge");

    return {
      resolvedSkills: toResolvedMap(resolvedSkills),
      resolvedCommands: toResolvedMap(resolvedCommands),
      resolvedMcpServers: toResolvedMap(resolvedMcpServers),
      resolvedSubagents: toResolvedMap(resolvedSubagents),
      resolvedFiles: toResolvedMap(resolvedFiles),
      resolvedRules: toResolvedMap(resolvedRules),
      resolvedHooks: toResolvedMap(resolvedHooks),
      resolvedKnowledge: toResolvedMap(resolvedKnowledge),
      dependencyRefs: [
        ...resolvedSkills,
        ...resolvedCommands,
        ...resolvedMcpServers,
        ...resolvedSubagents,
        ...resolvedFiles,
        ...resolvedRules,
        ...resolvedHooks,
        ...resolvedKnowledge,
      ].map((dependency) => dependency.ref),
    };
  });
