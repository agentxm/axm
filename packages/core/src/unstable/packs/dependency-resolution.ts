import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef, Handle, ExtensionName, ExtensionType } from "../extensions/index.js";
import { formatFqn, parseFqnOrThrow } from "../extensions/index.js";
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
  readonly dependencyRefs: ReadonlyArray<ExtensionRef>;
}

type SupportedPackDependencyType = "skill" | "command" | "mcp-server" | "subagent" | "file";

const registrySourceForDependency = (
  pack: PackRef,
  owner: Handle,
): Effect.Effect<RegistrySource, AppError> => {
  if (pack.source.type !== "registry") {
    return Effect.fail(
      makeAppError({
        code: "usage",
        detail: `Cannot resolve pack dependencies from non-registry source`,
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
    if (parsed.type !== expectedType) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack dependency type mismatch for expected ${expectedType}`,
      });
    }

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
      decodeVersionSync(dependency.ref.version),
    ]),
  );

const resolveDependencyGroup = <T extends SupportedPackDependencyType>(
  pack: PackRef,
  dependencies: ReadonlyArray<readonly [string, VersionRange]>,
  expectedType: T,
  sources: SourceHostProvidersService,
): Effect.Effect<ReadonlyArray<ResolvedDependency<T>>, AppError> =>
  Effect.forEach(
    dependencies,
    ([fqn, constraint]) => resolveDependencyRef(pack, expectedType, fqn, constraint, sources),
    { concurrency: "unbounded" },
  );

const partitionDependencies = (dependencies: ExtensionDependencyConstraintMap) => {
  const skills: Array<readonly [string, VersionRange]> = [];
  const commands: Array<readonly [string, VersionRange]> = [];
  const mcpServers: Array<readonly [string, VersionRange]> = [];
  const subagents: Array<readonly [string, VersionRange]> = [];
  const files: Array<readonly [string, VersionRange]> = [];
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
      case "file":
        files.push([fqn, constraint]);
        break;
      case "rule":
      case "pack":
        unsupported.push(fqn);
        break;
    }
  }

  return { skills, commands, mcpServers, subagents, files, unsupported };
};

export const resolvePackDependencies = (
  pack: PackRef,
  sources: SourceHostProvidersService,
): Effect.Effect<ResolvedPackDependencies, AppError> =>
  Effect.gen(function* () {
    const dependencies = partitionDependencies(pack.pack.dependencies);
    if (dependencies.unsupported.length > 0) {
      return yield* makeAppError({
        code: "usage",
        detail: `Pack declares unsupported dependency type(s): ${dependencies.unsupported.join(", ")}`,
      });
    }

    const resolvedSkills = yield* resolveDependencyGroup(
      pack,
      dependencies.skills,
      "skill",
      sources,
    );
    const resolvedCommands = yield* resolveDependencyGroup(
      pack,
      dependencies.commands,
      "command",
      sources,
    );
    const resolvedMcpServers = yield* resolveDependencyGroup(
      pack,
      dependencies.mcpServers,
      "mcp-server",
      sources,
    );
    const resolvedSubagents = yield* resolveDependencyGroup(
      pack,
      dependencies.subagents,
      "subagent",
      sources,
    );
    const resolvedFiles = yield* resolveDependencyGroup(pack, dependencies.files, "file", sources);

    return {
      resolvedSkills: toResolvedMap(resolvedSkills),
      resolvedCommands: toResolvedMap(resolvedCommands),
      resolvedMcpServers: toResolvedMap(resolvedMcpServers),
      resolvedSubagents: toResolvedMap(resolvedSubagents),
      resolvedFiles: toResolvedMap(resolvedFiles),
      dependencyRefs: [
        ...resolvedSkills.map((dependency) =>
          buildRegistrySkillRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.packages,
          ),
        ),
        ...resolvedCommands.map((dependency) =>
          buildRegistryCommandRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.packages,
          ),
        ),
        ...resolvedMcpServers.map((dependency) =>
          buildRegistryMcpServerRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.packages,
          ),
        ),
        ...resolvedSubagents.map((dependency) =>
          buildRegistrySubagentRef(
            dependency.owner,
            dependency.name,
            dependency.ref.version,
            dependency.source,
            dependency.ref.packages,
          ),
        ),
        ...resolvedFiles.map((dependency) => dependency.ref),
      ],
    };
  });
