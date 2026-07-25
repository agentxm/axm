import { decodeExtensionNameSync } from "../extensions/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type ExtensionName } from "../extensions/common.js";
import { type Handle } from "../extensions/handle.js";
import { parseRegistrySourceRef } from "../extensions/registry-source.js";
import {
  decodeVersionRangeSync,
  type VersionRange,
} from "../version-constraints/version-constraints.js";
import type {
  DeclarationResolution,
  ReconciliationAdapter,
  ReconciliationDeclaration,
} from "../workspace/reconciliation-types.js";

const parseRegistryMcpSource = (
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
  if (parsed === undefined || parsed.type !== "mcps") {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionRange ?? decodeVersionRangeSync("*"),
  });
};

export const mcpServerReconciliationAdapter: ReconciliationAdapter = {
  type: "mcps",
  scanDeclarations: (context) => {
    const declarations: ReconciliationDeclaration[] = [];
    const warnings: string[] = [];
    const servers = context.settings.mcpServers ?? {};

    for (const [name, entry] of Object.entries(servers)) {
      const source = typeof entry === "string" ? entry : entry.source;
      if (source.startsWith("workspace:")) continue;
      const parsed = parseRegistryMcpSource(source);
      const owner = Option.isSome(parsed)
        ? parsed.value.owner
        : Option.getOrUndefined(context.configuredOwner);
      if (owner === undefined) {
        warnings.push(
          `Skipping MCP server "${name}": source "${source}" is not a registry FQN and no workspace owner is configured.`,
        );
        continue;
      }

      declarations.push({
        type: "mcps",
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
    const parsed = parseRegistryMcpSource(declaration.source);
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
