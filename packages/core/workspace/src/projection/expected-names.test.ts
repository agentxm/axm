import { describe, expect, it } from "@effect/vitest";
import { UNCONSTRAINED_DESIRED_NODE } from "../desired-state/index.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "../desired-state/index.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { expectedProjectionNames } from "./expected-names.js";

const node = (type: ExtensionType, name: string, enabled: boolean): DesiredExtensionNode => ({
  type,
  name,
  identity: {
    authority: "registry",
    fqn: `@acme/${type}/${name}`,
    registry: { sourceName: undefined, endpoint: undefined },
  },
  enabled,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [],
  source: "agentxm",
});

const graph: DesiredStateGraph = {
  complete: true,
  problems: [],
  mcpSourceClosures: [],
  nodes: [
    node("skill", "alpha", true),
    node("skill", "retired", false),
    node("subagent", "scout", true),
    node("mcp-server", "docs", true),
    node("hook", "guard", true),
    node("rule", "house", true),
  ],
};

describe("expected projection names", () => {
  it("expects every enabled node of each per-agent type, and no disabled node", () => {
    const expected = expectedProjectionNames(graph);
    expect([...expected.subagent]).toEqual(["scout"]);
    expect([...expected["mcp-server"]]).toEqual(["docs"]);
    expect([...expected.hook]).toEqual(["guard"]);
    expect(expected.skill.has("retired")).toBe(false);
  });

  it("expects subagents in the Skill container, because that is where their profile lands", () => {
    expect([...expectedProjectionNames(graph).skill].sort()).toEqual(["alpha", "scout"]);
  });
});
