/**
 * How the command line presents each installable extension type: the nouns a
 * report calls its extensions, and the command that inspects what is
 * installed. `EXTENSION_TYPE_COMMANDS` decides which commands a type has;
 * this table decides the words every route of that type shares, so the root
 * `axm uninstall` form, the typed `axm skills uninstall` form, and the
 * type's `enable` and `disable` routes read the same.
 *
 * The `satisfies Record<InstallableExtensionType, ...>` is load-bearing: a
 * new installable type without a row is a compile error, and a row for
 * something that is not installable is an excess property.
 */

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export interface ExtensionTypePresentation {
  /** What a report calls one of, and several of, this type's extensions. */
  readonly noun: { readonly singular: string; readonly plural: string };
  /** The command that inspects what is installed of this type. */
  readonly inspect: SuggestedAction;
}

export const EXTENSION_TYPE_PRESENTATION = {
  skill: {
    noun: { singular: "skill", plural: "skills" },
    inspect: { description: "Inspect installed skills", cmd: "axm skills list" },
  },
  "mcp-server": {
    noun: { singular: "MCP server", plural: "MCP servers" },
    inspect: { description: "Inspect installed MCP servers", cmd: "axm mcps list" },
  },
  subagent: {
    noun: { singular: "subagent", plural: "subagents" },
    inspect: { description: "Inspect installed subagents", cmd: "axm subagents list" },
  },
  rule: {
    noun: { singular: "rule", plural: "rules" },
    inspect: { description: "Inspect installed rules", cmd: "axm rules list" },
  },
  hook: {
    noun: { singular: "hooks package", plural: "hooks packages" },
    inspect: { description: "Inspect installed hooks packages", cmd: "axm hooks list" },
  },
  knowledge: {
    noun: { singular: "knowledge bundle", plural: "knowledge bundles" },
    inspect: { description: "Inspect installed knowledge bundles", cmd: "axm knowledge list" },
  },
  pack: {
    noun: { singular: "pack", plural: "packs" },
    inspect: { description: "Inspect installed packs", cmd: "axm packs list" },
  },
} as const satisfies Record<InstallableExtensionType, ExtensionTypePresentation>;
