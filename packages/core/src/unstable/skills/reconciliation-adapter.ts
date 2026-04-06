import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { type ExtensionName } from "../extensions/common.js";
import { type Handle } from "../extensions/handle.js";
import { parseRegistrySourceRef } from "../extensions/registry-source.js";
import {
  decodeVersionConstraintSync,
  type VersionConstraint,
} from "../version-constraints/version-constraints.js";
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
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly constraint: VersionConstraint;
}> => {
  if (source === "registry") {
    return Option.none();
  }

  const parsed = parseRegistrySourceRef(source);
  if (parsed === undefined || parsed.type !== "skills") {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionConstraint ?? decodeVersionConstraintSync("*"),
  });
};

const toSkillSource = (
  entry: string | { readonly source: string; readonly enabled?: boolean | undefined },
): string => (typeof entry === "string" ? entry : entry.source);

export const skillReconciliationAdapter: ReconciliationAdapter = {
  type: "skills",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];

    const skills = context.settings.skills ?? {};
    for (const [name, entry] of Object.entries(skills)) {
      const source = toSkillSource(entry);
      const parsed = parseRegistrySkillSource(source);

      declarations.push({
        type: "skills",
        owner: Option.match(parsed, {
          onNone: () => context.defaultProfile,
          onSome: (value) => value.owner,
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

      const owner = Option.match(parsed, {
        onNone: () => declaration.owner,
        onSome: (value) => value.owner,
      });
      const diskName = Option.match(parsed, {
        onNone: () => declaration.name,
        onSome: (value) => value.name,
      });

      const canonicalPath = computeSkillPaths(
        env.path.join,
        context.baseDir,
        { refType: "registry", owner },
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

      if (manifest.owner !== owner || manifest.name !== diskName) {
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
          type: "skills",
          name: declaration.name,
          entry: {
            type: "registry",
            owner,
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
