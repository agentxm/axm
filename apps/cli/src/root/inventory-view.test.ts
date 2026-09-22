import { describe, expect, it } from "vitest";

import {
  inventoryActivation,
  inventoryAgentOutcomes,
  inventoryLifecycle,
  inventorySummary,
} from "./inventory-view.js";

describe("inventory human vocabulary", () => {
  it.each([
    ["configured", "managed by this workspace"],
    ["implicit", "included by a pack"],
    ["leftover", "installed but no longer selected"],
    ["undeclared", "authored here but not added"],
    ["unmanaged", "outside AXM"],
  ] as const)("renders %s in product language", (lifecycle, expected) => {
    expect(inventoryLifecycle({ lifecycle, enabled: true })).toBe(expected);
  });

  it("explains when activation does not apply", () => {
    expect(inventoryActivation({ lifecycle: "unmanaged", enabled: null })).toBe("not applicable");
  });

  it("maps agent outcomes instead of exposing their enum values", () => {
    expect(
      inventoryAgentOutcomes([
        {
          extensionType: "skill",
          name: "review",
          agentId: "claude-code",
          outcome: "projected",
          reasonCode: "projected",
          reason: "Projected successfully.",
        },
        {
          extensionType: "skill",
          name: "review",
          agentId: "cursor",
          outcome: "blocked",
          reasonCode: "unsupported-scope",
          reason: "project-scoped skills are unsupported",
        },
      ]),
    ).toBe("claude-code: available, cursor: not updated");
  });

  it("omits empty classifications from the summary", () => {
    expect(
      inventorySummary(
        {
          items: [],
          count: 4,
          configuredCount: 3,
          implicitCount: 0,
          installedCount: 3,
          leftoverCount: 0,
          undeclaredCount: 0,
          unmanagedCount: 1,
        },
        "skill",
      ),
    ).toBe("4 skills: 3 managed by this workspace, 3 installed, 1 found outside AXM");
  });
});
