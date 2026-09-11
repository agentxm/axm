/**
 * How the lifecycle column renders. An active agent renders blank rather
 * than "active": the column exists to draw the eye to the agents whose
 * vendor has stopped maintaining them.
 */

import { agentLifecycle } from "@agentxm/workspace-configuration";

export const lifecycleCell = (id: string): string => {
  const lifecycle = agentLifecycle(id);
  if (lifecycle.state === "active") return "";
  return lifecycle.supersededBy === null
    ? lifecycle.state
    : `${lifecycle.state} -> ${lifecycle.supersededBy}`;
};
