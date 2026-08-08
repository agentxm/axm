import { extensionTypes, toExtensionTypePlural } from "@agentxm/client-core/unstable/extensions";

const extensionGroups = extensionTypes.map(toExtensionTypePlural);

const installedExtensionCommands = extensionGroups.flatMap((group) =>
  ["install", "uninstall", "update", "enable", "disable", "list", "show"].map(
    (verb) => `axm ${group} ${verb}`,
  ),
);

const authoredExtensionCommands = extensionGroups.flatMap((group) =>
  ["new", "publish"].map((verb) => `axm ${group} ${verb}`),
);

/**
 * Commands whose behavior reads or mutates one selected installed-state root.
 * Command-tree tests enforce that every entry exposes the shared scope flag.
 */
export const INSTALLED_STATE_SCOPE_COMMANDS = [
  "axm setup",
  "axm install",
  "axm uninstall",
  "axm update",
  "axm status",
  "axm sync",
  "axm lint",
  "axm prune",
  "axm list",
  "axm agents",
  "axm agents list",
  "axm agents add",
  "axm agents remove",
  "axm mcps add",
  "axm mcps import",
  "axm mcps repair",
  "axm rules instructions",
  "axm rules instructions enable",
  "axm rules instructions disable",
  "axm rules instructions status",
  "axm knowledge search",
  "axm knowledge open",
  "axm knowledge lint",
  "axm packs unpack",
  ...installedExtensionCommands,
] as const;

/**
 * Commands that create or change project-owned authoring state. They never
 * accept a scope selector; help must state the project-workspace boundary.
 */
export const PROJECT_ONLY_AUTHORING_COMMANDS = [
  "axm adopt",
  "axm demote",
  "axm version",
  "axm publish",
  "axm skills copy",
  "axm packs add",
  "axm packs remove",
  "axm packs repair",
  ...authoredExtensionCommands,
] as const;
