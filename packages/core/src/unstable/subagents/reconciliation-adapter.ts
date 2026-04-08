/**
 * Subagent reconciliation adapter.
 *
 * Implements the ReconciliationAdapter interface for subagent extensions.
 * Unlike skills (which use symlinks), subagents use render-on-reconcile:
 * when source hash changes, rendered files are regenerated for all agents.
 *
 * @experimental This API is unstable and may change without notice.
 */

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
import { decodeExtensionNameSync, readAndDecodeManifest } from "../extensions/index.js";
import {
  SubagentManifestSchema,
  MANIFEST_FILENAME,
  type SubagentManifest,
} from "./manifest-schema.js";
import { computeSubagentPaths } from "./paths.js";
import { normalizeSubagentEntry } from "../settings/subagent-entry.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../workspace/reconciliation-types.js";

const parseRegistrySubagentSource = (
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
  if (parsed === undefined || parsed.type !== "subagents") {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionConstraint ?? decodeVersionConstraintSync("*"),
  });
};

export const subagentReconciliationAdapter: ReconciliationAdapter = {
  type: "subagents",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];

    const subagents = context.settings.subagents ?? {};
    for (const [name, entry] of Object.entries(subagents)) {
      const normalized = normalizeSubagentEntry(entry);
      const source = normalized.source;
      const parsed = parseRegistrySubagentSource(source);

      declarations.push({
        type: "subagents",
        owner: Option.match(parsed, {
          onNone: () => context.defaultProfile,
          onSome: (value) => value.owner,
        }),
        name: Option.match(parsed, {
          onNone: () => decodeExtensionNameSync(name),
          onSome: (value) => value.name,
        }),
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
      const parsed = parseRegistrySubagentSource(declaration.source);

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

      const canonicalPath = computeSubagentPaths(
        env.path.join,
        context.baseDir,
        { refType: "registry", owner },
        diskName,
      ).canonicalPath;

      const decodeSubagentManifest = (json: unknown): SubagentManifest | null => {
        try {
          return Schema.decodeUnknownSync(SubagentManifestSchema)(json);
        } catch {
          return null;
        }
      };

      const result = yield* readAndDecodeManifest(
        declaration,
        canonicalPath,
        MANIFEST_FILENAME,
        decodeSubagentManifest,
        "subagent",
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
          type: "subagents",
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

export const assertSubagentAdapterLoaded = (
  _adapter: typeof subagentReconciliationAdapter,
): void => {
  void _adapter;
};
