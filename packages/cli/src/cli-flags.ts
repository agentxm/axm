import { Flag } from "effect/unstable/cli";
import { DEFAULT_WORKSPACE_SCOPE, WORKSPACE_SCOPES } from "@agentxm/client-core/unstable/workspace";

export const scopeFlag = Flag.choice("scope", WORKSPACE_SCOPES).pipe(
  Flag.withDescription("Configuration scope: project (default) or user"),
  Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
);

export const includeIgnoredFlag = Flag.boolean("include-ignored").pipe(
  Flag.withDescription("Include extensions suppressed by ignore patterns"),
);
