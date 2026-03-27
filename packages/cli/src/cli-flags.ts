import { Flag } from "effect/unstable/cli";
import { DEFAULT_WORKSPACE_SCOPE, WORKSPACE_SCOPES } from "@axm.sh/core/unstable/workspace";

export const scopeFlag = Flag.choice("scope", WORKSPACE_SCOPES).pipe(
  Flag.withDescription("Configuration scope: project (default) or user"),
  Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
);
