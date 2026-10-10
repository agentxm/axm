import { describe, expect, it } from "vitest";

import { ABSENT } from "../screen/index.js";
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
    expect(inventoryLifecycle({ lifecycle })).toBe(expected);
  });

  it("explains when activation does not apply", () => {
    expect(inventoryActivation({ lifecycle: "unmanaged", enabled: null })).toBe(ABSENT);
  });

  it("maps agent outcomes instead of exposing their enum values", () => {
    expect(
      inventoryAgentOutcomes([
        {
          extensionType: "skill",
          name: "review",
          agentId: "claude-code",
          outcome: "projected",
          reasonCode: "supported",
          reason: "Projected successfully.",
        },
        {
          extensionType: "skill",
          name: "review",
          agentId: "cursor",
          outcome: "blocked",
          reasonCode: "scope-not-modeled",
          reason: "project-scoped skills are unsupported",
        },
      ]),
    ).toBe("claude-code: available, cursor: not updated");
  });

  it("omits empty classifications from the summary", () => {
    expect(
      inventorySummary(
        {
          items: [
            { installed: true },
            { installed: true },
            { installed: true },
            { installed: false },
          ],
          count: 4,
          managementCounts: {
            configured: 3,
            implicit: 0,
            leftover: 0,
            undeclared: 0,
            unmanaged: 1,
          },
        },
        "skill",
      ),
    ).toBe("4 skills: 3 managed by this workspace, 3 installed, 1 found outside AXM");
  });
});
