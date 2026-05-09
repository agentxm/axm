import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef, Handle, ExtensionName, ExtensionType } from "../extensions/index.js";
import { parseFqnOrThrow, formatFqn } from "../extensions/index.js";
import type { ResolvedExtensionMap } from "../lockfile/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { RegistrySource } from "../sources/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { PackRef } from "./refs.js";
import type { ExtensionDependencyConstraintMap } from "../extensions/index.js";
import { buildRegistrySkillRef } from "../skills/registry-ref-builder.js";
import { buildRegistryCommandRef } from "../commands/registry-ref-builder.js";
import { buildRegistryMcpServerRef } from "../mcp-servers/registry-ref-builder.js";
import { buildRegistrySubagentRef } from "../subagents/registry-ref-builder.js";
import {
  decodeVersionSync,
  type VersionRange,
} from "../version-constraints/version-constraints.js";

type ResolvedDependency<T extends ExtensionType = ExtensionType> = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly ref: Extract<ExtensionRef, { readonly refType: "registry"; readonly type: T }>;
  readonly source: RegistrySource;
};

export interface ResolvedPackDependencies {
  readonly resolvedSkills: ResolvedExtensionMap;
  readonly resolvedCommands: ResolvedExtensionMap;
  readonly resolvedMcpServers: ResolvedExtensionMap;
  readonly resolvedSubagents: ResolvedExtensionMap;
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

const resolveDependencyType = (
  expectedType: ExtensionType,
  parsedType: ExtensionType,
): Effect.Effect<void, AppError> => {
  if (parsedType === expectedType) {
    return Effect.void;
  }

  return Effect.fail(
    makeAppError({
      code: "usage",
      message: `Pack dependency type mismatch for expected ${expectedType}`,
    }),
  );
};

const registrySourceForDependency = (
  pack: PackRef,
  owner: Handle,
): Effect.Effect<RegistrySource, AppError> => {
  if (pack.source.type !== "registry") {
    return Effect.fail(
      makeAppError({
        code: "usage",
        message: `Cannot resolve pack dependencies from non-registry source`,
      }),
    );
  }

  return Effect.succeed({
    ...pack.source,
    owner: Option.some(owner),
  });
};

const resolveDependencyRef = <T extends ExtensionType>(
  pack: PackRef,
  expectedType: T,
  fqn: string,
  constraint: VersionRange,
  sources: SourceHostProvidersService,
): Effect.Effect<ResolvedDependency<T>, AppError> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    yield* resolveDependencyType(expectedType, parsed.type);

    const source = yield* registrySourceForDependency(pack, parsed.owner);
    const matches = yield* Effect.scoped(
      sources.find(source, {
        names: [parsed.name],
        type: expectedType,
        owner: Option.some(parsed.owner),
        versionRange: Option.some<string>(constraint),
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
        message: `Unable to resolve pack dependency ${fqn}@${constraint}`,
      });
    }

    return { ...parsed, ref: matchingRef, source };
  });

const toResolvedMap = <T extends ExtensionType>(
  dependencies: ReadonlyArray<ResolvedDependency<T>>,
): ResolvedExtensionMap =>
  Object.fromEntries(
    dependencies.map((dependency) => [
      formatFqn(dependency),
      decodeVersionSync(dependency.ref.version),
    ]),
  );

const resolveDependencyGroup = <T extends ExtensionType>(
  pack: PackRef,
  dependencies: ExtensionDependencyConstraintMap,
  expectedType: T,
  sources: SourceHostProvidersService,
): Effect.Effect<ReadonlyArray<ResolvedDependency<T>>, AppError> =>
  Effect.forEach(
    Object.entries(dependencies),
    ([fqn, constraint]) => resolveDependencyRef(pack, expectedType, fqn, constraint, sources),
    { concurrency: "unbounded" },
  );

export const resolvePackDependencies = (
  pack: PackRef,
  sources: SourceHostProvidersService,
): Effect.Effect<ResolvedPackDependencies, AppError> =>
  Effect.gen(function* () {
    const resolvedSkills = yield* resolveDependencyGroup(pack, pack.pack.skills, "skill", sources);
    const resolvedCommands = yield* resolveDependencyGroup(
      pack,
      pack.pack.commands,
      "command",
      sources,
    );
    const resolvedMcpServers = yield* resolveDependencyGroup(
      pack,
      pack.pack.mcpServers,
      "mcp-server",
      sources,
    );
    const resolvedSubagents = yield* resolveDependencyGroup(
      pack,
      pack.pack.subagents,
      "subagent",
      sources,
    );

    return {
      resolvedSkills: toResolvedMap(resolvedSkills),
      resolvedCommands: toResolvedMap(resolvedCommands),
      resolvedMcpServers: toResolvedMap(resolvedMcpServers),
      resolvedSubagents: toResolvedMap(resolvedSubagents),
      dependencyRefs: [
        ...resolvedSkills.map((dependency) =>
          buildRegistrySkillRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.compatiblePackages,
          ),
        ),
        ...resolvedCommands.map((dependency) =>
          buildRegistryCommandRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.compatiblePackages,
          ),
        ),
        ...resolvedMcpServers.map((dependency) =>
          buildRegistryMcpServerRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.compatiblePackages,
          ),
        ),
        ...resolvedSubagents.map((dependency) =>
          buildRegistrySubagentRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.compatiblePackages,
          ),
        ),
      ],
    };
  });
