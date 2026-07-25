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
import { type ExtensionName } from "../extensions/common.js";
import { type Handle } from "../extensions/handle.js";
import { parseRegistrySourceRef } from "../extensions/registry-source.js";
import {
  decodeVersionRangeSync,
  type VersionRange,
} from "../version-constraints/version-constraints.js";
import { decodeExtensionNameSync } from "../extensions/index.js";
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
  readonly constraint: VersionRange;
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
    constraint: parsed.versionRange ?? decodeVersionRangeSync("*"),
  });
};

export const subagentReconciliationAdapter: ReconciliationAdapter = {
  type: "subagents",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];
    const warnings: string[] = [];

    const subagents = context.settings.subagents ?? {};
    for (const [name, entry] of Object.entries(subagents)) {
      const source = typeof entry === "string" ? entry : entry.source;
      if (source.startsWith("workspace:")) continue;
      const parsed = parseRegistrySubagentSource(source);
      const owner = Option.isSome(parsed)
        ? parsed.value.owner
        : Option.getOrUndefined(context.configuredOwner);
      if (owner === undefined) {
        warnings.push(
          `Skipping subagent "${name}": source "${source}" is not a registry FQN and no workspace owner is configured.`,
        );
        continue;
      }

      declarations.push({
        type: "subagents",
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
    const parsed = parseRegistrySubagentSource(declaration.source);
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

export const assertSubagentAdapterLoaded = (
  _adapter: typeof subagentReconciliationAdapter,
): void => {
  void _adapter;
};
