import {
  decodeExtensionNameSync,
  type ExtensionName,
  extensionTypeToPlural,
  parseExtensionFqnParts,
} from "../extensions/index.js";
import { PackManifestSchema, PACK_MANIFEST_FILENAME } from "./manifest-schema.js";
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
} from "../workspace/reconciliation-types.js";
import {
  decodeVersionRangeSync,
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

  // Packs cannot nest; every other type declares a pack-origin member. Mapping
  // through the shared plural table keeps a new extension type from being
  // silently dropped — it would fail to satisfy ReconcileExtensionType instead.
  if (parsed.type === "pack") {
    return Option.none();
  }

  return Option.some({
    type: extensionTypeToPlural[parsed.type],
    owner: parsed.owner,
    name: parsed.name,
    source: fqn,
    declarationSourceOrConstraint: constraint,
    order,
    origin: "pack",
  });
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

export const packReconciliationAdapter: ReconciliationAdapter = {
  type: "packs",
  scanDeclarations: (context, env) =>
    Effect.gen(function* () {
      const declarations: ReconciliationDeclaration[] = [];
      const warnings: string[] = [];
      const packs = context.settings.packs ?? {};

      for (const [name, entry] of Object.entries(packs)) {
        const source = typeof entry === "string" ? entry : entry.source;
        const enabled = typeof entry === "string" || entry.enabled !== false;
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

        if (!enabled) continue;

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
  resolveDeclaration: (declaration) => {
    const parsed = parseRegistryPackSource(declaration.source);
    const reason =
      declaration.source !== "registry" && Option.isNone(parsed)
        ? "declaration-mismatch"
        : "missing-registry-metadata";
    return Effect.succeed({
      _tag: "Unresolved",
      declaration,
      reason,
    } satisfies DeclarationResolution);
  },
};
