import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef } from "../extensions/index.js";
import { parseFqnOrThrow } from "../extensions/index.js";
import type { ResolvedExtensionMap } from "../lockfile/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { RegistrySource } from "../sources/index.js";
import type { ExtensionType } from "../extensions/index.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { PackExtensionRef } from "./refs.js";
import { buildRegistrySkillRef } from "../skills/registry-ref-builder.js";
import { buildRegistryCommandRef } from "../commands/registry-ref-builder.js";
import { buildRegistryMcpServerRef } from "../mcp-servers/registry-ref-builder.js";
import { decodeExactSemverVersionSync } from "../version-constraints/index.js";

type ResolvedDependency<T extends ExtensionType = ExtensionType> = {
  readonly fqn: string;
  readonly ref: Extract<ExtensionRef, { readonly refType: "registry"; readonly type: T }>;
  readonly source: RegistrySource;
};

export interface ResolvedPackDependencies {
  readonly resolvedSkills: ResolvedExtensionMap;
  readonly resolvedCommands: ResolvedExtensionMap;
  readonly resolvedMcpServers: ResolvedExtensionMap;
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

const resolveDependencyType = (
  expectedType: ExtensionType,
  parsedType: string,
): Effect.Effect<void, AppError> => {
  const expectedPlural =
    expectedType === "mcp-server"
      ? "mcp-servers"
      : expectedType === "command"
        ? "commands"
        : "skills";

  if (parsedType === expectedPlural) {
    return Effect.void;
  }

  return Effect.fail(
    makeAppError({
      code: "PACK_DEPENDENCY_RESOLUTION_FAILED",
      what: `Pack dependency type mismatch for expected ${expectedType}`,
      details: [`Expected ${expectedPlural}, received ${parsedType}`],
    }),
  );
};

const registrySourceForDependency = (
  pack: PackExtensionRef,
  profile: string,
): Effect.Effect<RegistrySource, AppError> => {
  if (pack.source.type !== "registry") {
    return Effect.fail(
      makeAppError({
        code: "PACK_DEPENDENCY_RESOLUTION_FAILED",
        what: `Cannot resolve ${pack.pack.name} dependencies from non-registry source`,
      }),
    );
  }

  return Effect.succeed({
    ...pack.source,
    profile: Option.some(profile),
  });
};

const resolveDependencyRef = <T extends ExtensionType>(
  pack: PackExtensionRef,
  expectedType: T,
  fqn: string,
  constraint: string,
  sources: SourceHostProvidersService,
): Effect.Effect<ResolvedDependency<T>, AppError> =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(fqn);
    yield* resolveDependencyType(expectedType, parsed.type);

    const source = yield* registrySourceForDependency(pack, parsed.handle);
    const matches = yield* Effect.scoped(
      sources.find(source, {
        skillNames: [parsed.name],
        type: expectedType,
        profile: Option.some(parsed.handle),
        versionConstraint: Option.some(constraint),
      }),
    );

    const matchingRef = matches.find(
      (
        candidate,
      ): candidate is Extract<ExtensionRef, { readonly refType: "registry"; readonly type: T }> =>
        candidate.type === expectedType &&
        candidate.refType === "registry" &&
        candidate.profile === parsed.handle &&
        candidate.name === parsed.name,
    );

    if (matchingRef === undefined) {
      return yield* makeAppError({
        code: "PACK_DEPENDENCY_RESOLUTION_FAILED",
        what: `Unable to resolve pack dependency ${fqn}@${constraint}`,
      });
    }

    return { fqn, ref: matchingRef, source };
  });

const toResolvedMap = <T extends ExtensionType>(
  dependencies: ReadonlyArray<ResolvedDependency<T>>,
): ResolvedExtensionMap =>
  Object.fromEntries(
    dependencies.map((dependency) => [
      dependency.fqn,
      decodeExactSemverVersionSync(dependency.ref.version),
    ]),
  );

const resolveDependencyGroup = <T extends ExtensionType>(
  pack: PackExtensionRef,
  dependencies: Readonly<Record<string, string>>,
  expectedType: T,
  sources: SourceHostProvidersService,
): Effect.Effect<ReadonlyArray<ResolvedDependency<T>>, AppError> =>
  Effect.forEach(
    Object.entries(dependencies),
    ([fqn, constraint]) => resolveDependencyRef(pack, expectedType, fqn, constraint, sources),
    { concurrency: "unbounded" },
  );

export const resolvePackDependencies = (
  pack: PackExtensionRef,
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

    return {
      resolvedSkills: toResolvedMap(resolvedSkills),
      resolvedCommands: toResolvedMap(resolvedCommands),
      resolvedMcpServers: toResolvedMap(resolvedMcpServers),
      dependencyRefs: [
        ...resolvedSkills.map((dependency) =>
          buildRegistrySkillRef(dependency.fqn, dependency.ref.version, dependency.source),
        ),
        ...resolvedCommands.map((dependency) =>
          buildRegistryCommandRef(dependency.fqn, dependency.ref.version, dependency.source),
        ),
        ...resolvedMcpServers.map((dependency) =>
          buildRegistryMcpServerRef(dependency.fqn, dependency.ref.version, dependency.source),
        ),
      ],
    };
  });
