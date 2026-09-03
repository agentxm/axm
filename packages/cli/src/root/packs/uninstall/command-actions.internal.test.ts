import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeDesiredExtensionIdentity } from "@agentxm/extension-authoring";
import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";

import {
  validatePackRetirementFacts,
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
  mcpSourceClosures: [],
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
      {
        complete: false,
        nodes: [packNode(selected.desiredIdentity)],
        mcpSourceClosures: [],
        problems: [],
      },
      [selected],
    ),
  );
});

describe("pack uninstall graph readiness", () => {
  const incompleteGraph = (problems: DesiredStateGraph["problems"]): DesiredStateGraph => ({
    complete: false,
    nodes: [],
    mcpSourceClosures: [],
    problems,
  });

  const manifestPath = "packs/toolkit/pack.json";

  it("retires a selected pack whose own manifest is missing", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        { type: "pack-manifest-unavailable", pack: "@acme/packs/toolkit", path: manifestPath },
      ]),
      ["workspace:@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({
      readiness: "ready",
      retirements: [{ pack: "@acme/packs/toolkit", manifestPath, reason: "missing" }],
    });
  });

  it("retires a selected pack whose own manifest cannot be decoded", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        { type: "pack-manifest-invalid", pack: "@acme/packs/toolkit", path: manifestPath },
      ]),
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({
      readiness: "ready",
      retirements: [{ pack: "@acme/packs/toolkit", manifestPath, reason: "invalid" }],
    });
  });

  it("retires past the lock problems an unreadable manifest causes for the same pack", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        { type: "pack-manifest-unavailable", pack: "@acme/packs/toolkit", path: manifestPath },
        {
          type: "pack-manifest-content-mismatch",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          status: "missing",
          acceptedVersion: "1.0.0",
          acceptedContentIdentity: "sha256-accepted",
        },
        {
          type: "pack-resolution-unavailable",
          pack: "@acme/packs/toolkit",
          detail: "The configured external Pack has no matching accepted resolution.",
        },
      ]),
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({ readiness: "ready", retirements: [{ reason: "missing" }] });
  });

  it("stays blocked when a pack other than the target is incomplete", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        { type: "pack-manifest-unavailable", pack: "@acme/packs/toolkit", path: manifestPath },
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/sibling",
          path: "packs/sibling/pack.json",
        },
      ]),
      ["workspace:@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({ readiness: "blocked", id: PACK_UNINSTALL_GRAPH_BLOCKER_ID });
    if (decision.readiness === "blocked") {
      expect(decision.detail).toContain("restore or uninstall @acme/packs/sibling first");
    }
  });

  it("stays blocked on a graph problem that belongs to no pack", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        { type: "pack-manifest-unavailable", pack: "@acme/packs/toolkit", path: manifestPath },
        { type: "workspace-owner-missing", extensionType: "skill", name: "orphan" },
      ]),
      ["workspace:@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({ readiness: "blocked" });
  });

  it("stays blocked when the target's readable manifest declares another identity", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        {
          type: "pack-identity-mismatch",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          detail: "Expected @acme/packs/toolkit, found @other/packs/toolkit@1.0.0.",
        },
      ]),
      ["workspace:@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({
      readiness: "blocked",
      id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
      facts: [{ problemType: "pack-identity-mismatch", packs: ["@acme/packs/toolkit"] }],
    });
  });

  it("stays blocked when the target only disagrees with its accepted resolution", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        {
          type: "pack-manifest-content-mismatch",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          status: "changed",
          acceptedVersion: "1.0.0",
          acceptedContentIdentity: "sha256-accepted",
          observedVersion: "2.0.0",
          observedContentIdentity: "sha256-observed",
        },
      ]),
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({ readiness: "blocked" });
  });

  it("reports structured Pack and authority facts when it stays blocked", () => {
    const decision = planPackUninstallGraphReadiness(
      incompleteGraph([
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/sibling",
          path: "agent_extensions/agentxm/@acme/packs/sibling/pack.json",
        },
      ]),
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({
      readiness: "blocked",
      id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
      facts: [
        {
          problemType: "pack-manifest-unavailable",
          packs: ["@acme/packs/sibling"],
          authoritativeLocations: ["agent_extensions/agentxm/@acme/packs/sibling/pack.json"],
        },
      ],
    });
    if (decision.readiness === "blocked") {
      expect(decision.detail).toContain("@acme/packs/sibling");
      expect(decision.detail).toContain("pack-manifest-unavailable");
    }
  });

  it("stays blocked on an incomplete graph that reported no problem", () => {
    expect(
      planPackUninstallGraphReadiness(incompleteGraph([]), ["@acme/packs/toolkit"], "project"),
    ).toMatchObject({ readiness: "blocked", facts: [{ problemType: "unknown" }] });
  });

  it("returns the complete graph as ready with nothing to retire", () => {
    expect(planPackUninstallGraphReadiness(completeGraph([]), [], "project")).toMatchObject({
      readiness: "ready",
      retirements: [],
    });
  });
});

describe("pack retirement staleness", () => {
  const retirement = {
    pack: "@acme/packs/toolkit",
    manifestPath: "packs/toolkit/pack.json",
    reason: "missing",
  } as const;

  it.effect("accepts unchanged retirement facts", () =>
    validatePackRetirementFacts({ planned: [retirement], observed: [retirement] }),
  );

  it.effect("accepts a plan that retires nothing against an intact graph", () =>
    validatePackRetirementFacts({ planned: [], observed: [] }),
  );

  it.effect("conflicts when the target's package became readable before apply", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: [],
      }).pipe(Effect.flip);
      expect(error.code).toBe("conflict");
      expect(error.detail).toContain("@acme/packs/toolkit");
    }),
  );

  it.effect("conflicts when the target's package became unreadable before apply", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [],
        observed: [retirement],
      }).pipe(Effect.flip);
      expect(error.code).toBe("conflict");
    }),
  );

  it.effect("conflicts when the reason for the target's unreadability changed", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: [{ ...retirement, reason: "invalid" }],
      }).pipe(Effect.flip);
      expect(error.code).toBe("conflict");
    }),
  );

  it.effect("conflicts when the graph no longer supports any retirement decision", () =>
    Effect.gen(function* () {
      const error = yield* validatePackRetirementFacts({
        planned: [retirement],
        observed: undefined,
      }).pipe(Effect.flip);
      expect(error.code).toBe("conflict");
    }),
  );
});
