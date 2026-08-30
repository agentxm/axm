import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeDesiredExtensionIdentity } from "@agentxm/extension-management/unstable/extensions";
import type {
  DesiredExtensionNode,
  DesiredStateGraph,
} from "@agentxm/extension-management/unstable/workspace";

import {
  validateResolvedPackUninstallTargets,
  type ResolvedPackUninstallTarget,
} from "./command-actions.js";
import { PACK_UNINSTALL_GRAPH_BLOCKER_ID, planPackUninstallGraphReadiness } from "./readiness.js";

const targetFor = (identity: string): ResolvedPackUninstallTarget => {
  const decoded = decodeDesiredExtensionIdentity(identity);
  if (decoded === undefined || decoded.type !== "pack") {
    throw new Error(`Invalid pack test identity: ${identity}`);
  }
  return {
    type: "pack",
    owner: decoded.owner,
    name: decoded.name,
    authority: decoded.authority,
    desiredIdentity: identity,
  };
};

const packNode = (identity: string, name = "toolkit"): DesiredExtensionNode => ({
  type: "pack",
  name,
  identity,
  source: identity,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source: identity, enabled: true }],
});

const completeGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  complete: true,
  nodes,
  problems: [],
});

const expectFailureCode = (
  graph: DesiredStateGraph,
  targets: ReadonlyArray<ResolvedPackUninstallTarget>,
  code: "conflict" | "validation",
) =>
  Effect.gen(function* () {
    const error = yield* validateResolvedPackUninstallTargets(graph, targets).pipe(Effect.flip);
    expect(error.code).toBe(code);
  });

describe("pack uninstall target precondition", () => {
  const selected = targetFor("workspace:@acme/packs/toolkit");

  it.effect("accepts an unchanged target and ignores unrelated graph drift", () =>
    validateResolvedPackUninstallTargets(
      completeGraph([
        packNode(selected.desiredIdentity),
        {
          type: "skill",
          name: "unrelated",
          identity: "@other/skills/unrelated",
          source: "@other/skills/unrelated",
          enabled: true,
          constraints: [],
          origins: [
            {
              type: "settings",
              source: "@other/skills/unrelated",
              enabled: true,
            },
          ],
        },
      ]),
      [selected],
    ),
  );

  it.effect("fails with conflict when the selected owner changes", () =>
    expectFailureCode(
      completeGraph([packNode("workspace:@other/packs/toolkit")]),
      [selected],
      "conflict",
    ),
  );

  it.effect("fails with conflict when the selected authority changes", () =>
    expectFailureCode(completeGraph([packNode("@acme/packs/toolkit")]), [selected], "conflict"),
  );

  it.effect("fails with conflict when the selected node disappears", () =>
    expectFailureCode(completeGraph([]), [selected], "conflict"),
  );

  it.effect("fails with validation when the selected current identity cannot decode", () =>
    expectFailureCode(
      completeGraph([packNode("workspace:not-an-extension")]),
      [selected],
      "validation",
    ),
  );

  it.effect("revalidates target identity without introducing a graph-completeness rule", () =>
    validateResolvedPackUninstallTargets(
      { complete: false, nodes: [packNode(selected.desiredIdentity)], problems: [] },
      [selected],
    ),
  );
});

describe("pack uninstall graph readiness", () => {
  it("returns structured Pack and authority facts for an incomplete graph", () => {
    const decision = planPackUninstallGraphReadiness(
      {
        complete: false,
        nodes: [],
        problems: [
          {
            type: "pack-manifest-unavailable",
            pack: "@acme/packs/toolkit",
            path: "agent_extensions/agentxm/@acme/packs/toolkit/pack.json",
          },
        ],
      },
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({
      readiness: "blocked",
      id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
      facts: [
        {
          problemType: "pack-manifest-unavailable",
          packs: ["@acme/packs/toolkit"],
          authoritativeLocations: ["agent_extensions/agentxm/@acme/packs/toolkit/pack.json"],
        },
      ],
    });
    if (decision.readiness === "blocked") {
      expect(decision.detail).toContain("@acme/packs/toolkit");
      expect(decision.detail).toContain("pack-manifest-unavailable");
      expect(decision.detail).toContain("agent_extensions/agentxm/@acme/packs/toolkit/pack.json");
    }
  });

  it("returns the complete graph as ready", () => {
    expect(planPackUninstallGraphReadiness(completeGraph([]), [], "project")).toMatchObject({
      readiness: "ready",
    });
  });
});
