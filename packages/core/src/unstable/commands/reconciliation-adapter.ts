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

const parseRegistryCommandSource = (
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
  if (parsed === undefined || parsed.type !== "commands") {
    return Option.none();
  }

  return Option.some({
    owner: parsed.owner,
    name: parsed.name,
    constraint: parsed.versionRange ?? decodeVersionRangeSync("*"),
  });
};

export const commandReconciliationAdapter: ReconciliationAdapter = {
  type: "commands",
  scanDeclarations: (context) => {
    const commands = context.settings.commands ?? {};
    const declarations: ReconciliationDeclaration[] = [];
    const warnings: string[] = [];

    for (const [name, entry] of Object.entries(commands)) {
      const source = typeof entry === "string" ? entry : entry.source;
      if (source.startsWith("workspace:")) continue;
      const parsed = parseRegistryCommandSource(source);
      const owner = Option.isSome(parsed)
        ? parsed.value.owner
        : Option.getOrUndefined(context.configuredOwner);
      if (owner === undefined) {
        warnings.push(
          `Skipping command "${name}": source "${source}" is not a registry FQN and no workspace owner is configured.`,
        );
        continue;
      }

      declarations.push({
        type: "commands",
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
    const parsed = parseRegistryCommandSource(declaration.source);
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
