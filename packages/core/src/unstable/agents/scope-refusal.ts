/**
 * Refusal messages for user-scope resolves.
 *
 * AXM writes subagents to a single workspace-relative directory,
 * so every user-scope resolve is refused. The reason why differs, and the
 * catalog knows which: an agent whose capability declares the `user` scope has
 * a real user-scope surface AXM has not modeled, while an agent without it has
 * nowhere to write at all. Reporting both as "does not support" mislabels the
 * first group.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { AGENTS } from "./registry.js";
import type { AgentId } from "./types.js";

/** Extension types AXM resolves per scope. */
export type UserScopedExtension = "subagents";

const declaresUserScope = (agentId: AgentId): boolean => {
  const descriptor = AGENTS[agentId];
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
  readonly agentId: AgentId;
  readonly agentName: string;
  readonly type: UserScopedExtension;
}): string =>
  declaresUserScope(args.agentId)
    ? `AXM manages only the project-scope ${args.type} directory for ${args.agentName}; ${args.agentName} supports user-scope ${args.type} natively but AXM has not modeled that location`
    : `${args.agentName} does not support user-scope ${args.type}`;
