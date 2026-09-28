/**
 * The Pack-uninstall graph gate.
 *
 * Classifying one unsettled desired-state graph is a decision over data, so
 * these examples hand `planPackUninstallGraphReadiness` the exact problem set
 * the evaluation emits and read the decision back. The end-to-end consequences
 * of that decision — what is removed, what is preserved, what stays blocked —
 * belong to `cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable`.
 */

import { describe, expect, it } from "@effect/vitest";

import type {
  DesiredExtensionNode,
  DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";

import { PACK_UNINSTALL_GRAPH_BLOCKER_ID, planPackUninstallGraphReadiness } from "./readiness.js";

const settledGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  nodes,
  mcpSourceClosures: [],
  problems: [],
  packMembership: [],
});

const unsettledGraph = (problems: DesiredStateGraph["problems"]): DesiredStateGraph => ({
  nodes: [],
  mcpSourceClosures: [],
  problems,
  packMembership: [],
});

const manifestPath = "packs/toolkit/pack.json";

describe("pack uninstall graph readiness", () => {
  it("retires a selected pack whose own manifest is confirmed absent", () => {
    const decision = planPackUninstallGraphReadiness(
      unsettledGraph([
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          reason: "absent",
        },
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
      unsettledGraph([
        {
          type: "pack-manifest-invalid",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          reason: "malformed",
        },
      ]),
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({
      readiness: "ready",
      retirements: [{ pack: "@acme/packs/toolkit", manifestPath, reason: "invalid" }],
    });
  });

  it("stays blocked when an I/O failure hid the target's manifest", () => {
    const decision = planPackUninstallGraphReadiness(
      unsettledGraph([
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          reason: "unreadable",
          cause: "PermissionDenied",
        },
      ]),
      ["@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({ readiness: "blocked", id: PACK_UNINSTALL_GRAPH_BLOCKER_ID });
    if (decision.readiness === "blocked") {
      expect(decision.detail).toContain("PermissionDenied");
    }
  });

  it("stays blocked when a pack other than the target is unresolved", () => {
    const decision = planPackUninstallGraphReadiness(
      unsettledGraph([
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          reason: "absent",
        },
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/sibling",
          path: "packs/sibling/pack.json",
          reason: "absent",
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
      unsettledGraph([
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/toolkit",
          path: manifestPath,
          reason: "absent",
        },
        { type: "workspace-owner-missing", extensionType: "skill", name: "orphan" },
      ]),
      ["workspace:@acme/packs/toolkit"],
      "project",
    );

    expect(decision).toMatchObject({ readiness: "blocked" });
  });

  it("stays blocked when the target's readable manifest declares another identity", () => {
    const decision = planPackUninstallGraphReadiness(
      unsettledGraph([
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
      unsettledGraph([
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
      unsettledGraph([
        {
          type: "pack-manifest-unavailable",
          pack: "@acme/packs/sibling",
          path: "agent_extensions/registry/@acme/packs/sibling/pack.json",
          reason: "absent",
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
          authoritativeLocations: ["agent_extensions/registry/@acme/packs/sibling/pack.json"],
        },
      ],
    });
    if (decision.readiness === "blocked") {
      expect(decision.detail).toContain("@acme/packs/sibling");
      expect(decision.detail).toContain("pack-manifest-unavailable");
    }
  });

  it("returns the settled graph as ready with nothing to retire", () => {
    expect(planPackUninstallGraphReadiness(settledGraph([]), [], "project")).toMatchObject({
      readiness: "ready",
      retirements: [],
    });
  });
});
