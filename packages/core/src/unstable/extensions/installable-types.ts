import * as Schema from "effect/Schema";

import type { ExtensionType, ExtensionTypePlural } from "./common.js";

export const installableExtensionTypes = [
  "skill",
  "command",
  "mcp-server",
  "subagent",
  "context",
  "pack",
] as const satisfies ReadonlyArray<ExtensionType>;

export type InstallableExtensionType = (typeof installableExtensionTypes)[number];

const installableExtensionTypeSet = new Set<string>(installableExtensionTypes);

export const isInstallableExtensionType = (
  value: ExtensionType,
): value is InstallableExtensionType => installableExtensionTypeSet.has(value);

export const installableExtensionTypePluralSegments = [
  "skills",
  "commands",
  "mcps",
  "subagents",
  "context",
  "packs",
] as const satisfies ReadonlyArray<ExtensionTypePlural>;

export type InstallableExtensionTypePlural =
  (typeof installableExtensionTypePluralSegments)[number];

const installableExtensionTypePluralSet = new Set<string>(installableExtensionTypePluralSegments);

export const isInstallableExtensionTypePlural = (
  value: string | undefined,
): value is InstallableExtensionTypePlural =>
  value !== undefined && installableExtensionTypePluralSet.has(value);

const installableExtensionTypeFromPlural: Record<
  InstallableExtensionTypePlural,
  InstallableExtensionType
> = {
  skills: "skill",
  commands: "command",
  mcps: "mcp-server",
  subagents: "subagent",
  context: "context",
  packs: "pack",
};

const installableExtensionTypeToPlural: Record<
  InstallableExtensionType,
  InstallableExtensionTypePlural
> = {
  skill: "skills",
  command: "commands",
  "mcp-server": "mcps",
  subagent: "subagents",
  context: "context",
  pack: "packs",
};

export const toInstallableExtensionType = (
  segment: InstallableExtensionTypePlural,
): InstallableExtensionType => installableExtensionTypeFromPlural[segment];

export const toInstallableExtensionTypePlural = (
  type: InstallableExtensionType,
): InstallableExtensionTypePlural => installableExtensionTypeToPlural[type];

export const InstallableExtensionTypeSchema = Schema.Literals(installableExtensionTypes).annotate({
  identifier: "InstallableExtensionType",
  title: "Installable Extension Type",
  description: "Extension types supported by install-oriented CLI and registry flows.",
});

export const InstallableExtensionTypePluralSchema = Schema.Literals(
  installableExtensionTypePluralSegments,
).annotate({
  identifier: "InstallableExtensionTypePlural",
  title: "Installable Extension Type (Plural)",
  description:
    "Plural extension type segments supported by install-oriented CLI and registry flows.",
});
