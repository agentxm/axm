import { REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import { computePackPaths } from "./paths.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import { PackManifestSchema, PACK_MANIFEST_FILENAME } from "./manifest-schema.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../../workspace/reconciliation-types.js";

const parseRegistryPackSource = (
  source: string,
): Option.Option<{
  readonly namespace: string;
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

  return Option.some({
    namespace: match[1]!,
    name: match[2]!,
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

  return Option.some({
    extensionType,
    namespace: match[1]!,
    name: match[2]!,
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
        const namespace = Option.match(parsed, {
          onNone: () => context.defaultNamespace,
          onSome: (value) => value.namespace,
        });
        const diskName = Option.match(parsed, {
          onNone: () => name,
          onSome: (value) => value.name,
        });

        declarations.push({
          extensionType: "packs",
          namespace,
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
          namespace,
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
            return JSON.parse(manifestRaw) as unknown;
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

      const namespace = Option.match(parsed, {
        onNone: () => declaration.namespace,
        onSome: (value) => value.namespace,
      });
      const diskName = Option.match(parsed, {
        onNone: () => declaration.name,
        onSome: (value) => value.name,
      });

      const canonicalPath = env.path.join(
        context.baseDir,
        REGISTRY_EXTENSIONS_DIR,
        namespace,
        "packs",
        diskName,
      );

      const exists = yield* env.fs.exists(canonicalPath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "LOCKFILE_RECONCILE_DISK_CHECK_FAILED",
            what: `Failed to check pack path: ${canonicalPath}`,
            cause: error,
          }),
        ),
      );

      if (!exists) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "missing",
        } satisfies DeclarationResolution;
      }

      const manifestPath = env.path.join(canonicalPath, PACK_MANIFEST_FILENAME);
      const manifestRaw = yield* env.fs
        .readFileString(manifestPath)
        .pipe(Effect.catch(() => Effect.succeed("")));

      if (manifestRaw.length === 0) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      const parsedJson = yield* Effect.sync(() => {
        try {
          return JSON.parse(manifestRaw) as unknown;
        } catch {
          return null;
        }
      });

      if (parsedJson === null) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(parsedJson).pipe(
        Effect.catch(() => Effect.succeed<null>(null)),
      );

      if (manifest === null) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      if (manifest.namespace !== namespace || manifest.name !== diskName) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "declaration-mismatch",
        } satisfies DeclarationResolution;
      }

      return {
        _tag: "Compatible",
        reconstructed: {
          extensionType: "packs",
          name: declaration.name,
          entry: {
            type: "registry",
            namespace,
            name: diskName,
            resolvedVersion: manifest.version,
            integrity: "",
            sourceName: "default",
            installedAt: context.now,
            updatedAt: context.now,
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
          },
        },
      } satisfies DeclarationResolution;
    }),
};
