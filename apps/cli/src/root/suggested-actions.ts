import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export const SET_UP_AXM_WORKSPACE = {
  description: "Set up AXM in this workspace",
  cmd: "axm setup",
} as const satisfies SuggestedAction;

export const INSPECT_INSTALLED = {
  description: "Inspect installed extensions",
  cmd: "axm list",
} as const satisfies SuggestedAction;
