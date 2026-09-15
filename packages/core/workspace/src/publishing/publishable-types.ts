import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";

/**
 * Publish policy, total over every extension type: a new type cannot be added
 * without deciding whether it publishes.
 */
export const PUBLISHABLE_TYPES = {
  skill: true,
  "mcp-server": true,
  subagent: true,
  rule: true,
  hook: true,
  knowledge: true,
  pack: true,
} as const satisfies Record<ExtensionType, boolean>;

type TruthyKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

export type PublishableType = TruthyKeys<typeof PUBLISHABLE_TYPES>;

export const isPublishableType = (type: ExtensionType): type is PublishableType =>
  PUBLISHABLE_TYPES[type];
