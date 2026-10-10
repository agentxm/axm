import { withParameterDefault, withParameterDescription } from "../cli-parameters.js";
import { Flag } from "effect/cli";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
} from "@agentxm/extension-model/unstable/workspace-scope";

export const scopeFlag = Flag.Literals("scope", WORKSPACE_SCOPES).pipe(
  withParameterDescription("Workspace scope"),
  withParameterDefault(DEFAULT_WORKSPACE_SCOPE),
);
