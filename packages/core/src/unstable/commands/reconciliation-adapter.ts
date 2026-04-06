import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { COMMAND_MANIFEST_FILENAME, CommandManifestSchema } from "./manifest-schema.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import { type ExtensionName } from "../extensions/common.js";
import { type Handle } from "../extensions/handle.js";
import { parseRegistrySourceRef } from "../extensions/registry-source.js";
import {
  decodeVersionConstraintSync,
  type VersionConstraint,
} from "../version-constraints/version-constraints.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../workspace/reconciliation-types.js";

const parseRegistryCommandSource = (
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
  if (parsed === undefined || parsed.type !== "commands") {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionConstraint ?? decodeVersionConstraintSync("*"),
  });
};

export const commandReconciliationAdapter: ReconciliationAdapter = {
  type: "commands",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];
    const commands = context.settings.commands ?? {};

    for (const [name, source] of Object.entries(commands)) {
      const parsed = parseRegistryCommandSource(source);
      declarations.push({
        type: "commands",
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
      const parsed = parseRegistryCommandSource(declaration.source);

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

      const canonicalPath = env.path.join(
        context.baseDir,
        REGISTRY_EXTENSIONS_DIR,
        owner,
        "commands",
        diskName,
      );

      const exists = yield* env.fs.exists(canonicalPath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "LOCKFILE_RECONCILE_DISK_CHECK_FAILED",
            what: `Failed to check command path: ${canonicalPath}`,
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

      const manifestPath = env.path.join(canonicalPath, COMMAND_MANIFEST_FILENAME);
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
          const parsed: unknown = JSON.parse(manifestRaw);
          return parsed;
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

      const manifest = yield* Schema.decodeUnknownEffect(CommandManifestSchema)(parsedJson).pipe(
        Effect.catch(() => Effect.succeed<null>(null)),
      );

      if (manifest === null) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "invalid",
        } satisfies DeclarationResolution;
      }

      if (manifest.owner !== owner || manifest.name !== diskName) {
        return {
          _tag: "Unresolved",
          declaration,
          reason: "declaration-mismatch",
        } satisfies DeclarationResolution;
      }

      return {
        _tag: "Compatible",
        reconstructed: {
          type: "commands",
          name: declaration.name,
          entry: {
            type: "registry",
            owner,
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
