/**
 * Factory for registry-distributed reconciliation adapters.
 *
 * Every registry-distributed extension type reconciles the same way: scan the
 * type's settings map for non-workspace declarations, and defer resolution to
 * install because canonical registry metadata (resolvedVersion, integrity,
 * publisherBindingId) never survives a corrupt lockfile. Only the settings map
 * accessor, the plural type literal, and the warning label vary per type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type ExtensionName } from "../extensions/common.js";
import { type Handle } from "../extensions/handle.js";
import { parseRegistrySourceRef } from "../extensions/registry-source.js";
import {
  decodeVersionRangeSync,
  type VersionRange,
} from "../version-constraints/version-constraints.js";
import { decodeExtensionNameSync } from "../extensions/index.js";
import type { Settings } from "../settings/index.js";
import type {
  DeclarationResolution,
  ReconcileExtensionType,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "./reconciliation-types.js";

export interface RegistryReconciliationAdapterOptions {
  readonly type: ReconcileExtensionType;
  /** Human label used in skip warnings, e.g. "skill" or "MCP server". */
  readonly label: string;
  readonly selectEntries: (
    settings: Settings,
  ) => Readonly<Record<string, string | { readonly source: string }>> | undefined;
}

const parseRegistrySource = (
  type: ReconcileExtensionType,
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
  if (parsed === undefined || parsed.type !== type) {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionRange ?? decodeVersionRangeSync("*"),
  });
};

export const makeRegistryReconciliationAdapter = (
  options: RegistryReconciliationAdapterOptions,
): ReconciliationAdapter => ({
  type: options.type,
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];
    const warnings: string[] = [];

    const entries = options.selectEntries(context.settings) ?? {};
    for (const [name, entry] of Object.entries(entries)) {
      const source = typeof entry === "string" ? entry : entry.source;
      if (source.startsWith("workspace:")) continue;
      const parsed = parseRegistrySource(options.type, source);

      const owner = Option.isSome(parsed)
        ? parsed.value.owner
        : Option.getOrUndefined(context.configuredOwner);
      if (owner === undefined) {
        warnings.push(
          `Skipping ${options.label} "${name}": source "${source}" is not a registry FQN and no workspace owner is configured.`,
        );
        continue;
      }

      declarations.push({
        type: options.type,
        owner,
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

    return Effect.succeed({ declarations, warnings });
  },
  resolveDeclaration: (declaration) => {
    const parsed = parseRegistrySource(options.type, declaration.source);
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
});
