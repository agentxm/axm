import { describe, expect, it } from "vitest";
import { projectExtensionInventory } from "./inventory.js";

const key = (name: string) => ({ scope: "project", type: "skill", name }) as const;

describe("projectExtensionInventory", () => {
  it("returns the lifecycle partition and excludes ignored candidates by default", () => {
    const result = projectExtensionInventory({
      lifecycle: [
        { key: key("configured"), lifecycle: "configured", enabled: true, installed: true },
        { key: key("implicit"), lifecycle: "implicit", enabled: true, installed: true },
        { key: key("unmanaged"), lifecycle: "unmanaged", enabled: null, installed: true },
      ],
      ignored: [{ key: key("old-skill"), reason: "actual-ignored" }],
      ignoredPatterns: new Set(["old-*", "*-skill"]),
      includeIgnored: false,
    });

    expect(result.items.map((item) => item.name)).toEqual(["configured", "implicit", "unmanaged"]);
    expect(result).toMatchObject({
      count: 3,
      configuredCount: 1,
      implicitCount: 1,
      installedCount: 3,
      unmanagedCount: 1,
      ignoredCount: 0,
    });
  });

  it("aggregates ignored observations without assigning a lifecycle", () => {
    const result = projectExtensionInventory({
      lifecycle: [],
      ignored: [
        {
          key: key("old-skill"),
          reason: "actual-ignored",
          agents: ["codex"],
          origins: ["agent-skill-dir"],
          paths: ["/home/.codex/skills/old-skill"],
        },
        {
          key: key("old-skill"),
          reason: "declared-ignored",
          agents: ["claude-code"],
          origins: ["canonical-axm-skill"],
          paths: ["/workspace/.axm/extensions/@acme/skills/old-skill"],
        },
      ],
      ignoredPatterns: new Set(["*-skill", "old-*", "unrelated"]),
      includeIgnored: true,
    });

    expect(result.items).toEqual([
      {
        scope: "project",
        type: "skill",
        name: "old-skill",
        classification: {
          kind: "ignored",
          matchedBy: ["*-skill", "old-*"],
          reasons: ["actual-ignored", "declared-ignored"],
        },
        enabled: null,
        installed: false,
        agents: ["claude-code", "codex"],
        origins: ["agent-skill-dir", "canonical-axm-skill"],
        paths: [
          "/home/.codex/skills/old-skill",
          "/workspace/.axm/extensions/@acme/skills/old-skill",
        ],
      },
    ]);
    expect(result).toMatchObject({
      count: 1,
      installedCount: 0,
      unmanagedCount: 0,
      ignoredCount: 1,
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
      ignored: [],
      ignoredPatterns: new Set(),
      includeIgnored: false,
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

  it("filters lifecycle and ignored observations consistently by agent", () => {
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
      ignored: [
        { key: key("ignored-claude"), reason: "actual-ignored", agents: ["claude-code"] },
        { key: key("ignored-codex"), reason: "actual-ignored", agents: ["codex"] },
      ],
      ignoredPatterns: new Set(["ignored-*"]),
      includeIgnored: true,
      agents: ["codex"],
    });

    expect(result.items.map((item) => item.name)).toEqual(["codex", "ignored-codex"]);
    expect(result).toMatchObject({ count: 2, unmanagedCount: 1, ignoredCount: 1 });
  });
});
