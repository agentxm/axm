import { Flag } from "effect/unstable/cli";

import { scopeFlag } from "../../cli-flags/scope-flag.js";

export const scopeConfig = {
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user knowledge state")),
} as const;
