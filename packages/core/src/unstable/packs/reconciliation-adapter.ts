import {
  decodeExtensionNameSync,
  REGISTRY_EXTENSIONS_DIR,
  type ExtensionName,
  parseExtensionFqnParts,
  parseFqnOrThrow,
  readAndDecodeManifest,
  extensionTypeFromPlural,
} from "../extensions/index.js";
import {
  PackManifestSchema,
  PACK_MANIFEST_FILENAME,
  type PackManifest,
} from "./manifest-schema.js";
import type { ExtensionDependencyConstraintMap } from "../extensions/index.js";
import { computePackPaths } from "./paths.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { type Handle } from "../extensions/handle.js";
import { parseRegistrySourceRef } from "../extensions/registry-source.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
  UnresolvedReason,
} from "../workspace/reconciliation-types.js";
import {
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
  SkillManifestSchema,
} from "../skills/manifest-schema.js";
import { computeSkillPaths } from "../skills/paths.js";
import { COMMAND_MANIFEST_FILENAME, CommandManifestSchema } from "../commands/manifest-schema.js";
import { MCP_SERVER_MANIFEST_FILENAME, McpServerManifestSchema } from "../mcps/manifest-schema.js";
import {
  MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME,
  SubagentManifestSchema,
} from "../subagents/manifest-schema.js";
import { versionSatisfiesRange } from "../version-constraints/version-constraints.js";
import type { AppError } from "../app-error/index.js";
import { makeRegistryPackLockEntry, type ResolvedExtensionMap } from "../lockfile/index.js";
import {
  decodeVersionRangeSync,
  type Version,
  type VersionRange,
} from "../version-constraints/version-constraints.js";

const parseRegistryPackSource = (
  source: string,
): Option.Option<{
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly constraint: VersionRange;
}> => {
  if (source === "registry") {
    return Option.none();
  }

  const parsed = parseRegistrySourceRef(source);
  if (parsed === undefined || parsed.type !== "packs") {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionRange ?? decodeVersionRangeSync("*"),
  });
};

const parsePackDependency = (
  fqn: string,
  constraint: VersionRange,
  order: number,
): Option.Option<ReconciliationDeclaration> => {
  const parsed = parseExtensionFqnParts(fqn);
  if (parsed === undefined) {
    return Option.none();
  }

  switch (parsed.type) {
    case "skill":
      return Option.some({
        type: "skills",
        owner: parsed.owner,
        name: parsed.name,
        source: fqn,
        declarationSourceOrConstraint: constraint,
        order,
        origin: "pack",
      });
    case "command":
      return Option.some({
        type: "commands",
        owner: parsed.owner,
        name: parsed.name,
        source: fqn,
        declarationSourceOrConstraint: constraint,
        order,
        origin: "pack",
      });
    case "mcp-server":
      return Option.some({
        type: "mcps",
        owner: parsed.owner,
        name: parsed.name,
        source: fqn,
        declarationSourceOrConstraint: constraint,
        order,
        origin: "pack",
      });
    case "subagent":
      return Option.some({
        type: "subagents",
        owner: parsed.owner,
        name: parsed.name,
        source: fqn,
        declarationSourceOrConstraint: constraint,
        order,
        origin: "pack",
      });
    case "files":
    case "rule":
    case "hook":
    case "knowledge":
    case "pack":
      return Option.none();
  }
};

const collectPackDependencyDeclarations = (
  candidates: unknown,
  declarations: Array<ReconciliationDeclaration>,
) => {
  if (candidates === null || typeof candidates !== "object") {
    return;
  }

  for (const [fqn, constraint] of Object.entries(candidates)) {
    if (typeof constraint !== "string") {
      continue;
    }
    let versionRange: VersionRange;
    try {
      versionRange = decodeVersionRangeSync(constraint);
    } catch {
      continue;
    }
    const parsedDep = parsePackDependency(fqn, versionRange, declarations.length);
    if (Option.isSome(parsedDep)) {
      declarations.push(parsedDep.value);
    }
  }
};

type DependencyManifest = {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly version: Version;
};

type DependencyResolution =
  | {
      readonly _tag: "Resolved";
      readonly version: Version;
    }
  | {
      readonly _tag: "Unresolved";
      readonly reason: UnresolvedReason;
    };

const makeManifestDecoder = <A extends DependencyManifest>(
  schema: Schema.Schema<A> & Schema.Decoder<unknown>,
) => {
  const decode = Schema.decodeUnknownSync(schema);
  return (json: unknown): DependencyManifest | null => {
    try {
      return decode(json);
    } catch {
      return null;
    }
  };
};

const decodeSkillManifest = makeManifestDecoder(SkillManifestSchema);
const decodeCommandManifest = makeManifestDecoder(CommandManifestSchema);
const decodeMcpServerManifest = makeManifestDecoder(McpServerManifestSchema);
const decodeSubagentManifest = makeManifestDecoder(SubagentManifestSchema);

const readInstalledDependencyVersion = (
  type: "skills" | "commands" | "mcps" | "subagents",
  fqn: string,
  constraint: VersionRange,
  context: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[1],
  env: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[2],
): Effect.Effect<DependencyResolution, AppError> =>
  Effect.gen(function* () {
    const parsed = parseExtensionFqnParts(fqn);

    if (parsed === undefined || parsed.type !== extensionTypeFromPlural[type]) {
      return {
        _tag: "Unresolved",
        reason: "declaration-mismatch",
      } satisfies DependencyResolution;
    }

    const dependencyDeclaration: ReconciliationDeclaration = {
      type,
      owner: parsed.owner,
      name: parsed.name,
      source: fqn,
      declarationSourceOrConstraint: constraint,
      order: 0,
      origin: "pack",
    };

    const canonicalPath =
      type === "skills"
        ? computeSkillPaths(
            env.path.join,
            context.baseDir,
            { refType: "registry", owner: parsed.owner },
            parsed.name,
          ).canonicalPath
        : env.path.join(context.baseDir, REGISTRY_EXTENSIONS_DIR, parsed.owner, type, parsed.name);

    const result =
      type === "skills"
        ? yield* readAndDecodeManifest(
            dependencyDeclaration,
            canonicalPath,
            SKILL_MANIFEST_FILENAME,
            decodeSkillManifest,
            "skill",
            env,
          )
        : type === "commands"
          ? yield* readAndDecodeManifest(
              dependencyDeclaration,
              canonicalPath,
              COMMAND_MANIFEST_FILENAME,
              decodeCommandManifest,
              "command",
              env,
            )
          : type === "mcps"
            ? yield* readAndDecodeManifest(
                dependencyDeclaration,
                canonicalPath,
                MCP_SERVER_MANIFEST_FILENAME,
                decodeMcpServerManifest,
                "MCP server",
                env,
              )
            : yield* readAndDecodeManifest(
                dependencyDeclaration,
                canonicalPath,
                SUBAGENT_MANIFEST_FILENAME,
                decodeSubagentManifest,
                "subagent",
                env,
              );

    if (result._tag !== "ok") {
      return {
        _tag: "Unresolved",
        reason: result.reason,
      } satisfies DependencyResolution;
    }

    const { manifest } = result;
    if (manifest.owner !== parsed.owner || manifest.name !== parsed.name) {
      return {
        _tag: "Unresolved",
        reason: "declaration-mismatch",
      } satisfies DependencyResolution;
    }

    if (!versionSatisfiesRange(manifest.version, constraint)) {
      return {
        _tag: "Unresolved",
        reason: "declaration-mismatch",
      } satisfies DependencyResolution;
    }

    return {
      _tag: "Resolved",
      version: manifest.version,
    } satisfies DependencyResolution;
  });

const resolveInstalledDependencyMap = (
  type: "skills" | "commands" | "mcps" | "subagents",
  dependencies: ExtensionDependencyConstraintMap | undefined,
  context: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[1],
  env: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[2],
): Effect.Effect<
  | {
      readonly _tag: "Resolved";
      readonly resolved: ResolvedExtensionMap;
    }
  | {
      readonly _tag: "Unresolved";
      readonly reason: UnresolvedReason;
    },
  AppError
> =>
  Effect.gen(function* () {
    const resolvedEntries: Array<readonly [string, Version]> = [];

    for (const [fqn, constraint] of Object.entries(dependencies ?? {})) {
      const result = yield* readInstalledDependencyVersion(type, fqn, constraint, context, env);

      if (result._tag === "Unresolved") {
        return result;
      }

      resolvedEntries.push([fqn, result.version]);
    }

    return {
      _tag: "Resolved",
      resolved: Object.fromEntries(resolvedEntries),
    } as const;
  });

const filterDependenciesByType = (
  dependencies: ExtensionDependencyConstraintMap,
  type: "skills" | "commands" | "mcps" | "subagents",
): ExtensionDependencyConstraintMap =>
  Object.fromEntries(
    Object.entries(dependencies).filter(
      ([fqn]) => parseExtensionFqnParts(fqn)?.type === extensionTypeFromPlural[type],
    ),
  );

const resolveInstalledDependencyMaps = (
  dependencies: ExtensionDependencyConstraintMap,
  context: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[1],
  env: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[2],
) =>
  Effect.gen(function* () {
    for (const fqn of Object.keys(dependencies)) {
      const parsed = parseFqnOrThrow(fqn);
      switch (parsed.type) {
        case "skill":
        case "command":
        case "mcp-server":
        case "subagent":
          break;
        case "files":
        case "rule":
        case "hook":
        case "pack":
          return {
            _tag: "Unresolved",
            reason: "declaration-mismatch",
          } as const;
      }
    }

    const resolvedSkills = yield* resolveInstalledDependencyMap(
      "skills",
      filterDependenciesByType(dependencies, "skills"),
      context,
      env,
    );
    if (resolvedSkills._tag === "Unresolved") {
      return resolvedSkills;
    }

    const resolvedCommands = yield* resolveInstalledDependencyMap(
      "commands",
      filterDependenciesByType(dependencies, "commands"),
      context,
      env,
    );
    if (resolvedCommands._tag === "Unresolved") {
      return resolvedCommands;
    }

    const resolvedMcpServers = yield* resolveInstalledDependencyMap(
      "mcps",
      filterDependenciesByType(dependencies, "mcps"),
      context,
      env,
    );
    if (resolvedMcpServers._tag === "Unresolved") {
      return resolvedMcpServers;
    }

    const resolvedSubagents = yield* resolveInstalledDependencyMap(
      "subagents",
      filterDependenciesByType(dependencies, "subagents"),
      context,
      env,
    );
    if (resolvedSubagents._tag === "Unresolved") {
      return resolvedSubagents;
    }

    return {
      _tag: "Resolved",
      resolvedSkills: resolvedSkills.resolved,
      resolvedCommands: resolvedCommands.resolved,
      resolvedMcpServers: resolvedMcpServers.resolved,
      resolvedSubagents: resolvedSubagents.resolved,
    } as const;
  });

export const packReconciliationAdapter: ReconciliationAdapter = {
  type: "packs",
  scanDeclarations: (context, env) =>
    Effect.gen(function* () {
      const declarations: ReconciliationDeclaration[] = [];
      const warnings: string[] = [];
      const packs = context.settings.packs ?? {};

      for (const [name, entry] of Object.entries(packs)) {
        const source = typeof entry === "string" ? entry : entry.source;
        if (source.startsWith("workspace:")) continue;
        const parsed = parseRegistryPackSource(source);
        const owner = Option.isSome(parsed)
          ? parsed.value.owner
          : Option.getOrUndefined(context.configuredOwner);
        if (owner === undefined) {
          warnings.push(
            `Skipping pack "${name}": source "${source}" is not a registry FQN and no workspace owner is configured.`,
          );
          continue;
        }
        const diskName = Option.match(parsed, {
          onNone: () => decodeExtensionNameSync(name),
          onSome: (value) => value.name,
        });

        declarations.push({
          type: "packs",
          owner,
          name: diskName,
          source,
          declarationSourceOrConstraint: Option.match(parsed, {
            onNone: () => source,
            onSome: (value) => value.constraint,
          }),
          order: declarations.length,
          origin: "settings",
        });

        const packDir = computePackPaths(
          env.path.join,
          context.baseDir,
          owner,
          diskName,
        ).canonicalPath;
        const manifestPath = env.path.join(packDir, PACK_MANIFEST_FILENAME);
        const manifestRaw = yield* env.fs
          .readFileString(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed("")));
        if (manifestRaw.length === 0) {
          continue;
        }

        const parsedJson = yield* Effect.sync(() => {
          try {
            const parsedManifest: unknown = JSON.parse(manifestRaw);
            return parsedManifest;
          } catch {
            return null;
          }
        });
        if (parsedJson === null) {
          warnings.push(`PACK_MANIFEST_PARSE_FAILED: ${manifestPath}`);
          continue;
        }

        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(parsedJson).pipe(
          Effect.catch(() => Effect.succeed<null>(null)),
        );
        if (manifest === null) {
          warnings.push(`PACK_MANIFEST_INVALID: ${manifestPath}`);
          continue;
        }

        collectPackDependencyDeclarations(manifest.dependencies, declarations);
      }

      return { declarations, warnings };
    }),
  checkDiskCompatibility: (declaration, context, env) =>
    Effect.gen(function* () {
      const parsed = parseRegistryPackSource(declaration.source);

      if (declaration.source !== "registry" && Option.isNone(parsed)) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "declaration-mismatch",
        } satisfies DeclarationResolution;
      }

      const owner = Option.match(parsed, {
        onNone: () => declaration.owner,
        onSome: (value) => value.owner,
      });
      const diskName = Option.match(parsed, {
        onNone: () => declaration.name,
        onSome: (value) => value.name,
      });

      const canonicalPath = computePackPaths(
        env.path.join,
        context.baseDir,
        owner,
        diskName,
      ).canonicalPath;

      const decodePackManifest = (json: unknown): PackManifest | null => {
        try {
          return Schema.decodeUnknownSync(PackManifestSchema)(json);
        } catch {
          return null;
        }
      };

      const result = yield* readAndDecodeManifest(
        declaration,
        canonicalPath,
        PACK_MANIFEST_FILENAME,
        decodePackManifest,
        "pack",
        env,
      );

      if (result._tag !== "ok") return result;
      const { manifest } = result;

      if (manifest.owner !== owner || manifest.name !== diskName) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "declaration-mismatch",
        } satisfies DeclarationResolution;
      }

      const resolvedDependencies = yield* resolveInstalledDependencyMaps(
        manifest.dependencies,
        context,
        env,
      );
      if (resolvedDependencies._tag === "Unresolved") {
        return {
          _tag: "Unresolved",
          declaration,
          reason: resolvedDependencies.reason,
        } satisfies DeclarationResolution;
      }

      return {
        _tag: "Compatible",
        reconstructed: {
          type: "packs",
          name: declaration.name,
          entry: makeRegistryPackLockEntry({
            owner,
            name: diskName,
            resolvedVersion: manifest.version,
            integrity: "",
            sourceName: "default",
            installedAt: context.now,
            updatedAt: context.now,
            resolvedSkills: resolvedDependencies.resolvedSkills,
            resolvedCommands: resolvedDependencies.resolvedCommands,
            resolvedMcpServers: resolvedDependencies.resolvedMcpServers,
            resolvedSubagents: resolvedDependencies.resolvedSubagents,
          }),
        },
      } satisfies DeclarationResolution;
    }),
};
