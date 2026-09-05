import { Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "../../cli-flags/index.js";

import { scopeFlag } from "../../cli-flags/scope-flag.js";

export const scopeConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user knowledge state")),
} as const;

export const mutationFlags = {
  yes: yesFlag,
  preview: previewFlag,
} as const;
