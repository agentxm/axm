/**
 * How the command line presents each installable extension type: its report
 * nouns, route, selector flag, example name, and inspection command.
 * `EXTENSION_TYPE_COMMANDS` decides which commands a type has; this table
 * decides the words their routes share.
 *
 * The `satisfies Record<InstallableExtensionType, ...>` is load-bearing: a
 * new installable type without a row is a compile error, and a row for
 * something that is not installable is an excess property.
 */

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

interface ExtensionTypePresentation {
  /** What a report calls one of, and several of, this type's extensions. */
  readonly noun: { readonly singular: string; readonly plural: string };
  /** The plural command group. */
  readonly route: string;
  /** The root install selection flag without its leading dashes. */
  readonly selectorFlag: string;
  /** A representative extension name for command examples. */
  readonly exampleName: string;
  /** The command that inspects what is installed of this type. */
  readonly inspect: SuggestedAction;
}

export const EXTENSION_TYPE_PRESENTATION = {
  skill: {
    noun: { singular: "skill", plural: "skills" },
    route: "skills",
    selectorFlag: "skill",
    exampleName: "code-review",
    inspect: { description: "Inspect installed skills", cmd: "axm skills list" },
  },
  "mcp-server": {
    noun: { singular: "MCP server", plural: "MCP servers" },
    route: "mcps",
    selectorFlag: "mcp",
    exampleName: "context",
    inspect: { description: "Inspect installed MCP servers", cmd: "axm mcps list" },
  },
  subagent: {
    noun: { singular: "subagent", plural: "subagents" },
    route: "subagents",
    selectorFlag: "subagent",
    exampleName: "researcher",
    inspect: { description: "Inspect installed subagents", cmd: "axm subagents list" },
  },
  rule: {
    noun: { singular: "rule", plural: "rules" },
    route: "rules",
    selectorFlag: "rule",
    exampleName: "commit-style",
    inspect: { description: "Inspect installed rules", cmd: "axm rules list" },
  },
  hook: {
    noun: { singular: "hooks package", plural: "hooks packages" },
    route: "hooks",
    selectorFlag: "hook",
    exampleName: "workspace-baseline",
    inspect: { description: "Inspect installed hooks packages", cmd: "axm hooks list" },
  },
  knowledge: {
    noun: { singular: "knowledge bundle", plural: "knowledge bundles" },
    route: "knowledge",
    selectorFlag: "knowledge",
    exampleName: "platform",
    inspect: { description: "Inspect installed knowledge bundles", cmd: "axm knowledge list" },
  },
  pack: {
    noun: { singular: "pack", plural: "packs" },
    route: "packs",
    selectorFlag: "pack",
    exampleName: "frontend-tools",
    inspect: { description: "Inspect installed packs", cmd: "axm packs list" },
  },
} as const satisfies Record<InstallableExtensionType, ExtensionTypePresentation>;
