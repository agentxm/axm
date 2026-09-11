import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";

/**
 * Version-bump policy, total over every extension type: a new type cannot be
 * added without deciding whether `axm version` can bump it. The `false` rows
 * are capability gaps the parity program closes deliberately, not catalog
 * data.
 */
export const VERSIONABLE_TYPES = {
  skill: true,
  "mcp-server": true,
  subagent: true,
  rule: true,
  hook: true,
  knowledge: true,
  pack: true,
} as const satisfies Record<ExtensionType, boolean>;

type TruthyKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

export type VersionableExtensionType = TruthyKeys<typeof VERSIONABLE_TYPES>;

// Explicit order is user-visible in `axm version` help and error suggestions.
export const versionableTypes = [
  "skill",
  "subagent",
  "mcp-server",
  "rule",
  "hook",
  "knowledge",
  "pack",
] as const satisfies ReadonlyArray<VersionableExtensionType>;

export const isVersionableType = (type: ExtensionType): type is VersionableExtensionType =>
  VERSIONABLE_TYPES[type];
