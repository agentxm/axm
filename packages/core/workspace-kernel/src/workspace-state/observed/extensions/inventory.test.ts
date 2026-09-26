import { describe, expect, it } from "vitest";
import type { WorkspaceRecordRow } from "../records.js";
import { projectExtensionInventory } from "./inventory.js";

const row = (
  name: string,
  lifecycle: WorkspaceRecordRow["classification"]["lifecycle"],
  agents: ReadonlyArray<string> = [],
): WorkspaceRecordRow => ({
  scope: "project",
  type: "skill",
  name,
  classification: { kind: "lifecycle", lifecycle },
  enabled: lifecycle === "configured" || lifecycle === "implicit" ? true : null,
  installed: true,
  agents,
  origins: [],
  paths: [],
});

describe("projectExtensionInventory", () => {
  it("counts the complete lifecycle partition", () => {
    const rows = [
      row("configured", "configured"),
      row("implicit", "implicit"),
      row("leftover", "leftover"),
      row("undeclared", "undeclared"),
      row("unmanaged", "unmanaged"),
    ];
    expect(projectExtensionInventory(rows, { outcomes: () => [] })).toMatchObject({
      count: 5,
      configuredCount: 1,
      implicitCount: 1,
      installedCount: 5,
      leftoverCount: 1,
      undeclaredCount: 1,
      unmanagedCount: 1,
    });
  });

  it("filters by observed agents and outcome agents", () => {
    const rows = [row("claude", "configured", ["claude-code"]), row("codex", "implicit")];
    const inventory = projectExtensionInventory(rows, {
      outcomes: (record) =>
        record.name === "codex"
          ? [
              {
                extensionType: "skill",
                name: record.name,
                agentId: "codex",
                outcome: "current",
                reasonCode: "test",
                reason: "Test outcome",
              },
            ]
          : [],
      agents: ["codex"],
    });
    expect(inventory.items.map((item) => item.name)).toEqual(["codex"]);
    expect(inventory).toMatchObject({ count: 1, implicitCount: 1 });
  });
});
