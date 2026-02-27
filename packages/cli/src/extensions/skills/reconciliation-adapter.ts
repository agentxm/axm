import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeCliError } from "../../cli-error/index.js";
import { SkillManifestSchema, MANIFEST_FILENAME } from "./manifest-schema.js";
import { computeSkillPaths } from "./paths.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../../workspace/reconciliation-types.js";

const parseRegistrySkillSource = (
  source: string,
): Option.Option<{
  readonly namespace: string;
  readonly name: string;
  readonly constraint: string;
}> => {
  if (source === "registry") {
    return Option.none();
  }

  const match = /^(@[^/]+)\/skills\/([^@/]+)(?:@(.+))?$/.exec(source);
  if (!match) {
    return Option.none();
  }

  return Option.some({
    namespace: match[1]!,
    name: match[2]!,
    constraint: match[3] ?? "*",
  });
};

const toSkillSource = (
  entry: string | { readonly source: string; readonly enabled?: boolean | undefined },
): string => (typeof entry === "string" ? entry : entry.source);

export const skillReconciliationAdapter: ReconciliationAdapter = {
  extensionType: "skills",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];

    const skills = context.settings.skills ?? {};
    for (const [name, entry] of Object.entries(skills)) {
      const source = toSkillSource(entry);
      const parsed = parseRegistrySkillSource(source);

      declarations.push({
        extensionType: "skills",
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
      const parsed = parseRegistrySkillSource(declaration.source);
      const source = declaration.source;

      if (source !== "registry" && Option.isNone(parsed)) {
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

      const canonicalPath = computeSkillPaths(
        env.path.join,
        context.baseDir,
        { refType: "registry", namespace },
        diskName,
      ).canonicalPath;

      const exists = yield* env.fs.exists(canonicalPath).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "LOCKFILE_RECONCILE_DISK_CHECK_FAILED",
            what: `Failed to check skill path: ${canonicalPath}`,
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

      const manifestPath = env.path.join(canonicalPath, MANIFEST_FILENAME);
      const manifestRaw = yield* env.fs
        .readFileString(manifestPath)
        .pipe(Effect.catchAll(() => Effect.succeed("")));

      if (manifestRaw.length === 0) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      const manifestJson = yield* Effect.try({
        try: () => JSON.parse(manifestRaw) as unknown,
        catch: () =>
          makeCliError({
            code: "LOCKFILE_RECONCILE_MANIFEST_INVALID",
            what: `Invalid skill manifest JSON at ${manifestPath}`,
          }),
      }).pipe(Effect.catchAll(() => Effect.succeed<unknown>(null)));

      if (manifestJson === null) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      const manifest = yield* Schema.decodeUnknown(SkillManifestSchema)(manifestJson).pipe(
        Effect.catchAll(() => Effect.succeed<null>(null)),
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

      const timestamp = context.now;
      return {
        _tag: "Compatible",
        reconstructed: {
          extensionType: "skills",
          name: declaration.name,
          entry: {
            type: "registry",
            namespace,
            name: diskName,
            resolvedVersion: manifest.version,
            integrity: "",
            sourceName: "default",
            agents: context.agents,
            installedAt: timestamp,
            updatedAt: timestamp,
          },
        },
      } satisfies DeclarationResolution;
    }),
};

export const assertSkillAdapterLoaded = (_adapter: typeof skillReconciliationAdapter): void => {
  void _adapter;
};
