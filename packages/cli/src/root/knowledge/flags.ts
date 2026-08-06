import { Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";

import { scopeFlag } from "../../cli-flags.js";

export const scopeConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user knowledge state")),
} as const;

export const mutationFlags = {
  yes: yesFlag,
  preview: previewFlag,
} as const;
