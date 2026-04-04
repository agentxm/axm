import {
  REGISTRY_EXTENSIONS_DIR,
  parseFqnOrThrow,
  readAndDecodeManifest,
} from "../extensions/index.js";
import {
  PackManifestSchema,
  PACK_MANIFEST_FILENAME,
  type PackDependencyConstraintMap,
  type PackManifest,
} from "./manifest-schema.js";
import { computePackPaths } from "./paths.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
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
import {
  MCP_SERVER_MANIFEST_FILENAME,
  McpServerManifestSchema,
} from "../mcp-servers/manifest-schema.js";
import { satisfiesConstraint } from "../version-constraints/index.js";
import type { AppError } from "../app-error/index.js";
import { makeRegistryPackLockEntry, type ResolvedExtensionMap } from "../lockfile/index.js";
import type { ExactSemverVersion } from "../version-constraints/index.js";

const parseRegistryPackSource = (
  source: string,
): Option.Option<{
  readonly owner: string;
  readonly name: string;
  readonly constraint: string;
}> => {
  if (source === "registry") {
    return Option.none();
  }

  const match = /^(@[^/]+)\/packs\/([^@/]+)(?:@(.+))?$/.exec(source);
  if (!match) {
    return Option.none();
  }

  const owner = match[1];
  const name = match[2];
  if (owner === undefined || name === undefined) {
    return Option.none();
  }

  return Option.some({
    owner,
    name,
    constraint: match[3] ?? "*",
  });
};

const toPackSource = (entry: string | { readonly source: string }): string =>
  typeof entry === "string" ? entry : entry.source;

const parsePackDependency = (
  extensionType: "skills" | "commands" | "mcp-servers",
  fqn: string,
  constraint: string,
  order: number,
): Option.Option<ReconciliationDeclaration> => {
  const regex = new RegExp(`^(@[^/]+)\\/${extensionType}\\/([^@/]+)$`);
  const match = regex.exec(fqn);
  if (!match) {
    return Option.none();
  }

  const owner = match[1];
  const name = match[2];
  if (owner === undefined || name === undefined) {
    return Option.none();
  }

  return Option.some({
    extensionType,
    owner,
    name,
    source: fqn,
    declarationSourceOrConstraint: constraint,
    order,
    origin: "pack",
  });
};

const collectPackDependencyDeclarations = (
  extensionType: "skills" | "commands" | "mcp-servers",
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
    const parsedDep = parsePackDependency(extensionType, fqn, constraint, declarations.length);
    if (Option.isSome(parsedDep)) {
      declarations.push(parsedDep.value);
    }
  }
};

type DependencyManifest = {
  readonly owner: string;
  readonly name: string;
  readonly version: ExactSemverVersion;
};

type DependencyResolution =
  | {
      readonly _tag: "Resolved";
      readonly version: ExactSemverVersion;
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

const readInstalledDependencyVersion = (
  extensionType: "skills" | "commands" | "mcp-servers",
  fqn: string,
  constraint: string,
  context: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[1],
  env: Parameters<ReconciliationAdapter["checkDiskCompatibility"]>[2],
): Effect.Effect<DependencyResolution, AppError> =>
  Effect.gen(function* () {
    const parsed = (() => {
      try {
        return parseFqnOrThrow(fqn);
      } catch {
        return undefined;
      }
    })();

    if (parsed === undefined || parsed.type !== extensionType) {
      return {
        _tag: "Unresolved",
        reason: "declaration-mismatch",
      } satisfies DependencyResolution;
    }

    const dependencyDeclaration: ReconciliationDeclaration = {
      extensionType,
      owner: parsed.handle,
      name: parsed.name,
      source: fqn,
      declarationSourceOrConstraint: constraint,
      order: 0,
      origin: "pack",
    };

    const canonicalPath =
      extensionType === "skills"
        ? computeSkillPaths(
            env.path.join,
            context.baseDir,
            { refType: "registry", owner: parsed.handle },
            parsed.name,
          ).canonicalPath
        : env.path.join(
            context.baseDir,
            REGISTRY_EXTENSIONS_DIR,
            parsed.handle,
            extensionType,
            parsed.name,
          );

    const result =
      extensionType === "skills"
        ? yield* readAndDecodeManifest(
            dependencyDeclaration,
            canonicalPath,
            SKILL_MANIFEST_FILENAME,
            decodeSkillManifest,
            "skill",
            env,
          )
        : extensionType === "commands"
          ? yield* readAndDecodeManifest(
              dependencyDeclaration,
              canonicalPath,
              COMMAND_MANIFEST_FILENAME,
              decodeCommandManifest,
              "command",
              env,
            )
          : yield* readAndDecodeManifest(
              dependencyDeclaration,
              canonicalPath,
              MCP_SERVER_MANIFEST_FILENAME,
              decodeMcpServerManifest,
              "MCP server",
              env,
            );

    if (result._tag !== "ok") {
      return {
        _tag: "Unresolved",
        reason: result.reason,
      } satisfies DependencyResolution;
    }

    const { manifest } = result;
    if (manifest.owner !== parsed.handle || manifest.name !== parsed.name) {
      return {
        _tag: "Unresolved",
        reason: "declaration-mismatch",
      } satisfies DependencyResolution;
    }

    if (!satisfiesConstraint(manifest.version, constraint)) {
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
  extensionType: "skills" | "commands" | "mcp-servers",
  dependencies: PackDependencyConstraintMap | undefined,
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
    const resolvedEntries: Array<readonly [string, ExactSemverVersion]> = [];

    for (const [fqn, constraint] of Object.entries(dependencies ?? {})) {
      const result = yield* readInstalledDependencyVersion(
        extensionType,
        fqn,
        constraint,
        context,
        env,
      );

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

export const packReconciliationAdapter: ReconciliationAdapter = {
  extensionType: "packs",
  scanDeclarations: (context, env) =>
    Effect.gen(function* () {
      const declarations: ReconciliationDeclaration[] = [];
      const warnings: string[] = [];
      const packs = context.settings.packs ?? {};

      for (const [name, entry] of Object.entries(packs)) {
        const source = toPackSource(entry);
        const parsed = parseRegistryPackSource(source);
        const owner = Option.match(parsed, {
          onNone: () => context.defaultProfile,
          onSome: (value) => value.owner,
        });
        const diskName = Option.match(parsed, {
          onNone: () => name,
          onSome: (value) => value.name,
        });

        declarations.push({
          extensionType: "packs",
          owner,
          name,
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

        collectPackDependencyDeclarations("skills", manifest.skills, declarations);
        collectPackDependencyDeclarations("commands", manifest.commands, declarations);
        collectPackDependencyDeclarations("mcp-servers", manifest["mcp-servers"], declarations);
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

      const resolvedSkills = yield* resolveInstalledDependencyMap(
        "skills",
        manifest.skills,
        context,
        env,
      );
      if (resolvedSkills._tag === "Unresolved") {
        return {
          _tag: "Unresolved",
          declaration,
          reason: resolvedSkills.reason,
        } satisfies DeclarationResolution;
      }

      const resolvedCommands = yield* resolveInstalledDependencyMap(
        "commands",
        manifest.commands,
        context,
        env,
      );
      if (resolvedCommands._tag === "Unresolved") {
        return {
          _tag: "Unresolved",
          declaration,
          reason: resolvedCommands.reason,
        } satisfies DeclarationResolution;
      }

      const resolvedMcpServers = yield* resolveInstalledDependencyMap(
        "mcp-servers",
        manifest["mcp-servers"],
        context,
        env,
      );
      if (resolvedMcpServers._tag === "Unresolved") {
        return {
          _tag: "Unresolved",
          declaration,
          reason: resolvedMcpServers.reason,
        } satisfies DeclarationResolution;
      }

      return {
        _tag: "Compatible",
        reconstructed: {
          extensionType: "packs",
          name: declaration.name,
          entry: makeRegistryPackLockEntry({
            owner,
            name: diskName,
            resolvedVersion: manifest.version,
            integrity: "",
            sourceName: "default",
            installedAt: context.now,
            updatedAt: context.now,
            resolvedSkills: resolvedSkills.resolved,
            resolvedCommands: resolvedCommands.resolved,
            resolvedMcpServers: resolvedMcpServers.resolved,
          }),
        },
      } satisfies DeclarationResolution;
    }),
};
