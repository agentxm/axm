import { describe, expect, it } from "@effect/vitest";
import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { expectedProjectionNames, expectedProjectionNamesOf } from "./expected-names.js";

const node = (type: ExtensionType, name: string, enabled: boolean): DesiredExtensionNode => ({
  type,
  name,
  identity: `@acme/${type}/${name}`,
  enabled,
  constraints: [],
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

  it("assembles the same expectation from name sets a caller already holds", () => {
    expect(
      expectedProjectionNamesOf({
        skill: new Set(["alpha"]),
        subagent: new Set(["scout"]),
        mcpServer: new Set(["docs"]),
        hook: new Set(["guard"]),
      }),
    ).toEqual(expectedProjectionNames(graph));
  });
});
