import { describe, expect, it } from "vitest";
import { projectExtensionInventory } from "./inventory.js";

const key = (name: string) => ({ scope: "project", type: "skill", name }) as const;

describe("projectExtensionInventory", () => {
  it("returns the complete lifecycle partition", () => {
    const result = projectExtensionInventory({
      lifecycle: [
        { key: key("configured"), lifecycle: "configured", enabled: true, installed: true },
        { key: key("implicit"), lifecycle: "implicit", enabled: true, installed: true },
        { key: key("leftover"), lifecycle: "leftover", enabled: null, installed: true },
        { key: key("undeclared"), lifecycle: "undeclared", enabled: null, installed: true },
        { key: key("unmanaged"), lifecycle: "unmanaged", enabled: null, installed: true },
      ],
    });

    expect(result.items.map((item) => item.name)).toEqual([
      "configured",
      "implicit",
      "leftover",
      "undeclared",
      "unmanaged",
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        count: 5,
        configuredCount: 1,
        implicitCount: 1,
        installedCount: 5,
        leftoverCount: 1,
        undeclaredCount: 1,
        unmanagedCount: 1,
      }),
    );
  });

  it("prefers the most specific unexplained classification for one key", () => {
    const result = projectExtensionInventory({
      lifecycle: [
        { key: key("shared"), lifecycle: "unmanaged", enabled: null, installed: true },
        { key: key("shared"), lifecycle: "undeclared", enabled: null, installed: true },
        { key: key("shared"), lifecycle: "leftover", enabled: null, installed: true },
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        name: "shared",
        classification: { kind: "lifecycle", lifecycle: "leftover" },
      }),
    ]);
    expect(result).toMatchObject({ leftoverCount: 1, undeclaredCount: 0, unmanagedCount: 0 });
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
