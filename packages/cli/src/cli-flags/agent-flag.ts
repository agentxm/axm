import { Flag } from "effect/unstable/cli";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agents/types";

/**
 * Catalog-validated coding-agent selection. Repeatable; an identifier outside
 * the supported agent catalog is rejected by the parser before any handler
 * runs. Agent selection means workspace membership (`setup`) or a listing
 * filter (`skills list`, `subagents list`); commands re-describe the flag for
 * their own meaning. No command narrows a single extension to a subset of
 * configured agents.
 */
export const agentFlag = Flag.choice("agent", CONFIGURABLE_AGENT_IDS).pipe(
  Flag.atLeast(0),
  Flag.withDescription("Coding agent identifier from the supported catalog; repeatable"),
);
