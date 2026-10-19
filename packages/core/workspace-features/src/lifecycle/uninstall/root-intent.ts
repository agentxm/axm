import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { splitExtensionReference } from "@agentxm/extension-model/unstable/extensions";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";

import { decodeRootRegistryFqn } from "../root-registry-fqn.js";

export interface RootUninstallIntent {
  readonly source: string;
  readonly owner: string;
  readonly type: InstallableExtensionType;
  readonly name: string;
}

const rootUninstallFqnGrammar = "@<handle>/<plural-type>/<name>";

const genericPerTypeUninstallGuidance =
  "Use the matching per-type uninstall command instead: `axm skills uninstall <name>`, `axm subagents uninstall <name>`, `axm packs uninstall <name>`, or `axm mcps uninstall <name>`.";

const rootUninstallRegistryOnlyHowToFix = (source: string): string => {
  const parsed = parseInputPattern(source);

  if (Option.isNone(parsed)) {
    return `Use \`axm uninstall ${rootUninstallFqnGrammar}\`. ${genericPerTypeUninstallGuidance}`;
  }

  switch (parsed.value.pattern.pattern) {
    case "name-input":
    case "glob-input":
      return `Root uninstall only accepts registry FQNs. Use the matching per-type command instead: \`axm skills uninstall ${source}\`, \`axm subagents uninstall ${source}\`, \`axm packs uninstall ${source}\`, or \`axm mcps uninstall ${source}\`.`;
    case "file-path-pattern":
    case "url-input":
    case "git-scp-address":
    case "shorthand-input":
    case "slash-pattern":
    case "registry-pattern-input":
      return `Use \`axm uninstall ${rootUninstallFqnGrammar}\`. ${genericPerTypeUninstallGuidance}`;
    case "workspace-pattern-input":
      return "Use the matching per-type uninstall command for a workspace-authored extension.";
  }
};

/**
 * Root uninstall accepts only a registry FQN: it is the one form that names
 * the extension type without guessing, and every other spelling has a
 * per-type command that already knows the type.
 */
export const resolveRootUninstallIntent: (
  input: string,
) => Effect.Effect<RootUninstallIntent, ExtensionLifecycleFailed> = Effect.fn(
  "UninstallExtensions.resolveRootIntent",
)(function* (input: string) {
  const source = input.trim();

  if (!source.startsWith("@")) {
    return yield* installRefused({
      category: "usage",
      detail: "Root uninstall only accepts registry FQNs",
      suggestions: [{ description: rootUninstallRegistryOnlyHowToFix(source) }],
    });
  }

  const reference = splitExtensionReference(source);
  const { ref, type } = yield* decodeRootRegistryFqn({
    verb: "uninstall",
    grammar: rootUninstallFqnGrammar,
    source,
    fqn: reference.name,
  });

  if (reference.constraint !== undefined) {
    return yield* installRefused({
      category: "usage",
      detail: "Uninstall requires an unversioned extension FQN",
      recover: `Use ${rootUninstallFqnGrammar}; uninstall removes the configured extension`,
      suggestions: [
        { description: "Remove the configured extension", cmd: `axm uninstall ${reference.name}` },
      ],
    });
  }

  return {
    source,
    owner: ref.owner,
    type,
    name: ref.name,
  } satisfies RootUninstallIntent;
});
