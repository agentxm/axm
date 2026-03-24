import { REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import { MCP_SERVER_MANIFEST_FILENAME, McpServerManifestSchema } from "./manifest-schema.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../../workspace/reconciliation-types.js";

const parseRegistryMcpSource = (
  source: string,
): Option.Option<{
  readonly namespace: string;
  readonly name: string;
  readonly constraint: string;
}> => {
  if (source === "registry") {
    return Option.none();
  }

  const match = /^(@[^/]+)\/mcp-servers\/([^@/]+)(?:@(.+))?$/.exec(source);
  if (!match) {
    return Option.none();
  }

  return Option.some({
    namespace: match[1]!,
    name: match[2]!,
    constraint: match[3] ?? "*",
  });
};

export const mcpServerReconciliationAdapter: ReconciliationAdapter = {
  extensionType: "mcp-servers",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];
    const servers = context.settings.mcpServers ?? {};

    for (const [name, source] of Object.entries(servers)) {
      const parsed = parseRegistryMcpSource(source);
      declarations.push({
        extensionType: "mcp-servers",
        namespace: Option.match(parsed, {
          onNone: () => context.defaultNamespace,
          onSome: (value) => value.namespace,
        }),
        name,
        source,
        declarationSourceOrConstraint: Option.match(parsed, {
          onNone: () => source,
          onSome: (value) => value.constraint,
        }),
        order: declarations.length,
        origin: "settings",
      });
    }

    return Effect.succeed({ declarations, warnings: [] });
  },
  checkDiskCompatibility: (declaration, context, env) =>
    Effect.gen(function* () {
      const parsed = parseRegistryMcpSource(declaration.source);

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
        "mcp-servers",
        diskName,
      );

      const exists = yield* env.fs.exists(canonicalPath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "LOCKFILE_RECONCILE_DISK_CHECK_FAILED",
            what: `Failed to check MCP server path: ${canonicalPath}`,
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

      const manifestPath = env.path.join(canonicalPath, MCP_SERVER_MANIFEST_FILENAME);
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

      const manifest = yield* Schema.decodeUnknownEffect(McpServerManifestSchema)(parsedJson).pipe(
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
          extensionType: "mcp-servers",
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
          },
        },
      } satisfies DeclarationResolution;
    }),
};
