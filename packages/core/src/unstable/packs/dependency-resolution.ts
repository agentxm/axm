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
import type { ReleaseAgePolicy } from "../registry/index.js";
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
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

type SupportedPackDependencyType =
  "skill" | "command" | "mcp-server" | "subagent" | "files" | "rule" | "hook";

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
  releaseAgePolicy?: Option.Option<ReleaseAgePolicy>,
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
        ...(releaseAgePolicy === undefined ? {} : { releaseAgePolicy }),
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
  releaseAgePolicy?: Option.Option<ReleaseAgePolicy>,
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
        releaseAgePolicy,
        sourceOverride,
      ),
    { concurrency: "unbounded" },
  );

const partitionDependencies = (dependencies: ExtensionDependencyConstraintMap) => {
  const skills: Array<readonly [string, VersionRange]> = [];
  const commands: Array<readonly [string, VersionRange]> = [];
  const mcpServers: Array<readonly [string, VersionRange]> = [];
  const subagents: Array<readonly [string, VersionRange]> = [];
  const files: Array<readonly [string, VersionRange]> = [];
  const rules: Array<readonly [string, VersionRange]> = [];
  const hooks: Array<readonly [string, VersionRange]> = [];
  const unsupported: string[] = [];

  for (const [fqn, constraint] of Object.entries(dependencies)) {
    const parsed = parseFqnOrThrow(fqn);
    switch (parsed.type) {
      case "skill":
        skills.push([fqn, constraint]);
        break;
      case "command":
        commands.push([fqn, constraint]);
        break;
      case "mcp-server":
        mcpServers.push([fqn, constraint]);
        break;
      case "subagent":
        subagents.push([fqn, constraint]);
        break;
      case "files":
        files.push([fqn, constraint]);
        break;
      case "rule":
        rules.push([fqn, constraint]);
        break;
      case "hook":
        hooks.push([fqn, constraint]);
        break;
      case "pack":
        unsupported.push(fqn);
        break;
    }
  }

  return { skills, commands, mcpServers, subagents, files, rules, hooks, unsupported };
};

export const resolvePackDependencies = (
  pack: PackRef,
  sources: SourceHostProvidersService,
  releaseAgePolicy?: Option.Option<ReleaseAgePolicy>,
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

    const resolvedSkills = yield* resolveDependencyGroup(
      pack,
      dependencies.skills,
      "skill",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );
    const resolvedCommands = yield* resolveDependencyGroup(
      pack,
      dependencies.commands,
      "command",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );
    const resolvedMcpServers = yield* resolveDependencyGroup(
      pack,
      dependencies.mcpServers,
      "mcp-server",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );
    const resolvedSubagents = yield* resolveDependencyGroup(
      pack,
      dependencies.subagents,
      "subagent",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );
    const resolvedFiles = yield* resolveDependencyGroup(
      pack,
      dependencies.files,
      "files",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );
    const resolvedRules = yield* resolveDependencyGroup(
      pack,
      dependencies.rules,
      "rule",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );
    const resolvedHooks = yield* resolveDependencyGroup(
      pack,
      dependencies.hooks,
      "hook",
      sources,
      releaseAgePolicy,
      sourceOverride,
    );

    return {
      resolvedSkills: toResolvedMap(resolvedSkills),
      resolvedCommands: toResolvedMap(resolvedCommands),
      resolvedMcpServers: toResolvedMap(resolvedMcpServers),
      resolvedSubagents: toResolvedMap(resolvedSubagents),
      resolvedFiles: toResolvedMap(resolvedFiles),
      resolvedRules: toResolvedMap(resolvedRules),
      resolvedHooks: toResolvedMap(resolvedHooks),
      dependencyRefs: [
        ...resolvedSkills,
        ...resolvedCommands,
        ...resolvedMcpServers,
        ...resolvedSubagents,
        ...resolvedFiles,
        ...resolvedRules,
        ...resolvedHooks,
      ].map((dependency) => dependency.ref),
    };
  });
