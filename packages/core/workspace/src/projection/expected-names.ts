/**
 * The names an agent-facing projection is expected to hold.
 *
 * Lint, sync, agent removal, and uninstall all reconcile native output
 * against the same expectation: every enabled desired extension of each
 * per-agent type, with subagents also expected in the Skill container because
 * that is where their profile is projected. Deriving it once from the graph
 * keeps the callers from drifting apart, and keeps a Pack-contributed member
 * expected even when its own closure is blocked this run.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PerAgentType } from "@agentxm/extension-model/unstable/extensions/common";
import type { DesiredStateGraph } from "../desired-state/index.js";

/** Expected native entry names per per-agent extension type. */
export type ExpectedProjectionNames = Readonly<Record<PerAgentType, ReadonlySet<string>>>;

/** Assemble the expectation from the enabled nodes of a desired-state graph. */
export const expectedProjectionNames = (graph: DesiredStateGraph): ExpectedProjectionNames => {
  const enabled = (type: PerAgentType): ReadonlySet<string> =>
    new Set(
      graph.nodes.filter((node) => node.enabled && node.type === type).map(({ name }) => name),
    );
  const subagent = enabled("subagent");
  return {
    skill: new Set([...enabled("skill"), ...subagent]),
    subagent,
    "mcp-server": enabled("mcp-server"),
    hook: enabled("hook"),
  };
};
