/**
 * The names an agent-facing projection is expected to hold.
 *
 * Lint, sync, and agent removal all reconcile native output against the same
 * expectation: every enabled desired extension of each per-agent type, with
 * subagents also expected in the Skill container because that is where their
 * profile is projected. Deriving it once keeps the three callers from drifting
 * apart.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PerAgentType } from "@agentxm/extension-model/unstable/extensions/common";
import type { DesiredStateGraph } from "@agentxm/workspace-state";

/** Expected native entry names per per-agent extension type. */
export type ExpectedProjectionNames = Readonly<Record<PerAgentType, ReadonlySet<string>>>;

/** Assemble the expectation from name sets a caller already holds. */
export const expectedProjectionNamesOf = (names: {
  readonly skill: ReadonlySet<string>;
  readonly subagent: ReadonlySet<string>;
  readonly mcpServer: ReadonlySet<string>;
  readonly hook: ReadonlySet<string>;
}): ExpectedProjectionNames => ({
  skill: new Set([...names.skill, ...names.subagent]),
  subagent: names.subagent,
  "mcp-server": names.mcpServer,
  hook: names.hook,
});

/** Assemble the expectation from the enabled nodes of a desired-state graph. */
export const expectedProjectionNames = (graph: DesiredStateGraph): ExpectedProjectionNames => {
  const enabled = (type: PerAgentType): ReadonlySet<string> =>
    new Set(
      graph.nodes.filter((node) => node.enabled && node.type === type).map(({ name }) => name),
    );
  return expectedProjectionNamesOf({
    skill: enabled("skill"),
    subagent: enabled("subagent"),
    mcpServer: enabled("mcp-server"),
    hook: enabled("hook"),
  });
};
