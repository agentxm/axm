import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { readAndDecodeManifest } from "../extensions/index.js";
import { SkillManifestSchema, MANIFEST_FILENAME, type SkillManifest } from "./manifest-schema.js";
import { computeSkillPaths } from "./paths.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../workspace/reconciliation-types.js";

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

  const profile = match[1];
  const name = match[2];
  if (profile === undefined || name === undefined) {
    return Option.none();
  }

  return Option.some({
    profile,
    name,
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

      if (declaration.source !== "registry" && Option.isNone(parsed)) {
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

      const decodeSkillManifest = (json: unknown): SkillManifest | null => {
        try {
          return Schema.decodeUnknownSync(SkillManifestSchema)(json);
        } catch {
          return null;
        }
      };

      const result = yield* readAndDecodeManifest(
        declaration,
        canonicalPath,
        MANIFEST_FILENAME,
        decodeSkillManifest,
        "skill",
        env,
      );

      if (result._tag !== "ok") return result;
      const { manifest } = result;

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
