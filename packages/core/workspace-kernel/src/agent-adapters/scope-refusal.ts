/**
 * Refusal messages for user-scope resolves.
 *
 * Workspace setup currently manages Subagents only in project scope. Native
 * user paths can still be modeled and independently resolved by adapters. A
 * missing native user-scope declaration is not proof that the agent lacks it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";

/** Extension types AXM resolves per scope. */
export type UserScopedExtension = "subagents";

const declaresUserScope = (agentId: MaterializationTargetId): boolean => {
  const descriptor = AGENT_DESCRIPTORS[agentId];
  if (descriptor === undefined) return false;
  const scopes = descriptor.subagents?.scopes;
  return scopes?.includes("user") ?? false;
};

/**
 * Why AXM will not resolve a user-scope directory for this agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const userScopeRefusal = (args: {
  readonly agentId: MaterializationTargetId;
  readonly agentName: string;
  readonly type: UserScopedExtension;
}): string =>
  declaresUserScope(args.agentId)
    ? `AXM workspace setup manages only project-scope ${args.type} for ${args.agentName}; ${args.agentName} supports user-scope ${args.type} natively`
    : `AXM has not established a native user-scope ${args.type} target for ${args.agentName}`;
