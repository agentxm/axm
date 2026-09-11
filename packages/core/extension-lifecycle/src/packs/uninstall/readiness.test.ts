/**
 * The Pack-uninstall graph gate.
 *
 * Classifying one incomplete desired-state graph is a decision over data, so
 * these examples hand `planPackUninstallGraphReadiness` the exact problem set
 * the lock pass emits and read the decision back. The end-to-end consequences
 * of that decision — what is removed, what is preserved, what stays blocked —
 * belong to `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`.
 */

import { describe, expect, it } from "@effect/vitest";

import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";

import { PACK_UNINSTALL_GRAPH_BLOCKER_ID, planPackUninstallGraphReadiness } from "./readiness.js";

const completeGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  complete: true,
  nodes,
  mcpSourceClosures: [],
  problems: [],
});

const incompleteGraph = (problems: DesiredStateGraph["problems"]): DesiredStateGraph => ({
  complete: false,
  nodes: [],
  mcpSourceClosures: [],
  problems,
});

const manifestPath = "packs/toolkit/pack.json";

describe("pack uninstall graph readiness", () => {
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
