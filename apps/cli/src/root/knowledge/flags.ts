import { Flag } from "effect/unstable/cli";

import { scopeFlag } from "../../cli-flags/scope-flag.js";
import { previewCapabilityFlag } from "../shared/command-capabilities.js";

export const scopeConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user knowledge state")),
} as const;

export const mutationFlags = {
  preview: previewCapabilityFlag(),
} as const;
