import { CONFIGURABLE_AGENTS_BY_ID } from "@agentxm/extension-model/unstable/agent-capabilities";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agent-capabilities/identity";

/** Native protocols for which the shipped catalog declares an AXM Hook writer. */
export const HOOK_PROTOCOLS = CONFIGURABLE_AGENT_IDS.filter(
  (id) => CONFIGURABLE_AGENTS_BY_ID[id].capabilities.hook.axm.writer !== null,
);
