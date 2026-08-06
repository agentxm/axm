import { describe, expect, it } from "vitest";
import { projectExtensionInventory } from "./inventory.js";

const key = (name: string) => ({ scope: "project", type: "skill", name }) as const;

describe("projectExtensionInventory", () => {
  it("returns the complete lifecycle partition", () => {
    const result = projectExtensionInventory({
      lifecycle: [
        { key: key("configured"), lifecycle: "configured", enabled: true, installed: true },
        { key: key("implicit"), lifecycle: "implicit", enabled: true, installed: true },
        { key: key("unmanaged"), lifecycle: "unmanaged", enabled: null, installed: true },
      ],
    });

    expect(result.items.map((item) => item.name)).toEqual(["configured", "implicit", "unmanaged"]);
    expect(result).toMatchObject({
      count: 3,
      configuredCount: 1,
      implicitCount: 1,
      installedCount: 3,
      unmanagedCount: 1,
    });
  });

  it("deduplicates by extension key and applies lifecycle precedence", () => {
    const result = projectExtensionInventory({
      lifecycle: [
        {
          key: key("shared"),
          lifecycle: "unmanaged",
          enabled: null,
          installed: true,
          agents: ["codex"],
        },
        {
          key: key("shared"),
          lifecycle: "configured",
          enabled: false,
          installed: false,
          agents: ["claude-code"],
        },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        name: "shared",
        classification: { kind: "lifecycle", lifecycle: "configured" },
        enabled: false,
        agents: ["claude-code", "codex"],
      }),
    ]);
  });

  it("filters lifecycle observations by agent", () => {
    const result = projectExtensionInventory({
      lifecycle: [
        {
          key: key("claude"),
          lifecycle: "unmanaged",
          enabled: null,
          installed: true,
          agents: ["claude-code"],
        },
        {
          key: key("codex"),
          lifecycle: "unmanaged",
          enabled: null,
          installed: true,
          agents: ["codex"],
        },
      ],
      agents: ["codex"],
    });

    expect(result.items.map((item) => item.name)).toEqual(["codex"]);
    expect(result).toMatchObject({ count: 1, unmanagedCount: 1 });
  });
});
