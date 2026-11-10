import { type FailureSuggestedAction } from "@agentxm/workspace-kernel/operations";

export const SET_UP_AXM_WORKSPACE = {
  description: "Set up AXM in this workspace",
  invocation: { command: ["setup"], arguments: [] },
} as const satisfies FailureSuggestedAction;

export const INSPECT_INSTALLED = {
  description: "Inspect installed extensions",
  invocation: { command: ["list"], arguments: [] },
} as const satisfies FailureSuggestedAction;
