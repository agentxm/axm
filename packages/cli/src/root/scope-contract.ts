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
  "axm sync",
  "axm lint",
  "axm list",
  "axm agents",
  "axm agents list",
  "axm agents add",
  "axm agents remove",
  "axm mcps add",
  "axm mcps import",
  "axm rules instructions",
  "axm rules instructions enable",
  "axm rules instructions disable",
  "axm rules instructions status",
  "axm knowledge concepts resolve",
  "axm knowledge concepts search",
  "axm knowledge concepts query",
  "axm knowledge concepts get",
  "axm knowledge concepts related",
  "axm knowledge concepts status",
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
  "axm fork",
  "axm import",
  "axm packs add",
  "axm packs remove",
  ...authoredExtensionCommands,
] as const;
