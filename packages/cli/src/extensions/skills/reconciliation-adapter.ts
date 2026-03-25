import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { SkillManifestSchema, MANIFEST_FILENAME } from "@axm.sh/core/unstable/extensions";
import { computeSkillPaths } from "./paths.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../../workspace/reconciliation-types.js";

const parseRegistrySkillSource = (
  source: string,
): Option.Option<{
  readonly profile: string;
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
    profile: match[1]!,
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
        profile: Option.match(parsed, {
          onNone: () => context.defaultProfile,
          onSome: (value) => value.profile,
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

      const profile = Option.match(parsed, {
        onNone: () => declaration.profile,
        onSome: (value) => value.profile,
      });
      const diskName = Option.match(parsed, {
        onNone: () => declaration.name,
        onSome: (value) => value.name,
      });

      const canonicalPath = computeSkillPaths(
        env.path.join,
        context.baseDir,
        { refType: "registry", profile },
        diskName,
      ).canonicalPath;

      const exists = yield* env.fs.exists(canonicalPath).pipe(
        Effect.mapError((error) =>
          makeAppError({
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
        .pipe(Effect.catch(() => Effect.succeed("")));

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
          makeAppError({
            code: "LOCKFILE_RECONCILE_MANIFEST_INVALID",
            what: `Invalid skill manifest JSON at ${manifestPath}`,
          }),
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));

      if (manifestJson === null) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      const manifest = yield* Schema.decodeUnknownEffect(SkillManifestSchema)(manifestJson).pipe(
        Effect.catch(() => Effect.succeed<null>(null)),
      );

      if (manifest === null) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      if (manifest.profile !== profile || manifest.name !== diskName) {
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
            profile,
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
