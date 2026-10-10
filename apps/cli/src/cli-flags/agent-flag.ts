import { withParameterDescription } from "../cli-parameters.js";
import { Flag } from "effect/cli";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";

/**
 * Catalog-validated coding-agent selection. Repeatable; an identifier outside
 * the supported agent catalog is rejected by the parser before any handler
 * runs. Agent selection means workspace membership (setup, first install, or
 * first handoff) or filtering typed list/show inspection; commands re-describe the flag for
 * their own meaning. No command narrows a single extension to a subset of
 * configured agents.
 */
export const agentFlag = Flag.Literals("agent", CONFIGURABLE_AGENT_IDS).pipe(
  Flag.atLeast(0),
  withParameterDescription("Coding agent identifier from the supported catalog"),
);
