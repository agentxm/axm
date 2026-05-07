import { describe, expect, it } from "vitest";
import { buildRooModeEntry, mergeRooModes, removeRooMode, splitBody } from "./roo.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "roo-code",
  name: "code-reviewer",
  body: "You are a code reviewer.\n\nReview all code changes carefully.\nLook for bugs and style issues.",
  frontmatter: {
    name: "code-reviewer",
    description: "Reviews code changes",
  },
  agentOverrides: undefined,
};

describe("splitBody", () => {
  it("splits at first blank line", () => {
    const result = splitBody("First paragraph.\n\nSecond paragraph.\nMore content.");
    expect(result.roleDefinition).toBe("First paragraph.");
    expect(result.customInstructions).toBe("Second paragraph.\nMore content.");
  });

  it("uses entire body as roleDefinition when no blank line", () => {
    const result = splitBody("Single paragraph with no blank line.");
    expect(result.roleDefinition).toBe("Single paragraph with no blank line.");
    expect(result.customInstructions).toBe("");
  });

  it("trims whitespace", () => {
    const result = splitBody("  First paragraph.  \n\n  Second paragraph.  ");
    expect(result.roleDefinition).toBe("First paragraph.");
    expect(result.customInstructions).toBe("Second paragraph.");
  });
});

describe("buildRooModeEntry", () => {
  it("builds mode entry with slug, name, and split body", () => {
    const result = buildRooModeEntry(baseInput);
    expect(result.entry.slug).toBe("code-reviewer");
    expect(result.entry.name).toBe("code-reviewer");
    expect(result.entry.roleDefinition).toBe("You are a code reviewer.");
    expect(result.entry.customInstructions).toBe(
      "Review all code changes carefully.\nLook for bugs and style issues.",
    );
    expect(result.entry["_axm_managed"]).toBeUndefined();
  });

  it("omits customInstructions when body has no blank line", () => {
    const result = buildRooModeEntry({
      ...baseInput,
      body: "Single paragraph only.",
    });
    expect(result.entry.customInstructions).toBeUndefined();
    expect(result.entry.roleDefinition).toBe("Single paragraph only.");
  });

  it("uses default groups when not specified in frontmatter", () => {
    const result = buildRooModeEntry(baseInput);
    expect(result.entry.groups).toEqual(["read", "edit", "command", "mcp"]);
  });

  it("uses frontmatter groups when provided", () => {
    const result = buildRooModeEntry({
      ...baseInput,
      frontmatter: { ...baseInput.frontmatter, groups: ["read", "mcp"] },
    });
    expect(result.entry.groups).toEqual(["read", "mcp"]);
  });

  it("passes arbitrary frontmatter keys through", () => {
    const result = buildRooModeEntry({
      ...baseInput,
      frontmatter: { ...baseInput.frontmatter, whenToUse: "When reviewing code" },
    });
    expect(result.entry["whenToUse"]).toBe("When reviewing code");
  });

  it("structural body fields override matching frontmatter keys", () => {
    const result = buildRooModeEntry({
      ...baseInput,
      frontmatter: {
        ...baseInput.frontmatter,
        roleDefinition: "Stale role from frontmatter",
      },
    });
    expect(result.entry.roleDefinition).toBe("You are a code reviewer.");
  });

  describe("overrides", () => {
    it("merges overrides on top", () => {
      const result = buildRooModeEntry({
        ...baseInput,
        agentOverrides: { whenToUse: "When reviewing code" },
      });
      expect(result.entry["whenToUse"]).toBe("When reviewing code");
    });

    it("null override removes a base-entry field", () => {
      const result = buildRooModeEntry({
        ...baseInput,
        agentOverrides: { description: null },
      });
      expect("description" in result.entry).toBe(false);
    });
  });
});

describe("mergeRooModes", () => {
  it("adds new mode to empty array", () => {
    const entry = buildRooModeEntry(baseInput).entry;
    const result = mergeRooModes([], entry);
    expect(result).toHaveLength(1);
    expect(result[0]?.["slug"]).toBe("code-reviewer");
  });

  it("preserves manually-defined modes", () => {
    const manualMode = {
      slug: "architect",
      name: "Architect",
      roleDefinition: "...",
      groups: ["read"],
    };
    const entry = buildRooModeEntry(baseInput).entry;
    const result = mergeRooModes([manualMode], entry);
    expect(result).toHaveLength(2);
    expect(result[0]?.["slug"]).toBe("architect");
    expect(result[1]?.["slug"]).toBe("code-reviewer");
  });

  it("updates existing mode with same slug", () => {
    const existingMode = {
      slug: "code-reviewer",
      name: "code-reviewer",
      roleDefinition: "Old definition",
      groups: ["read"],
    };
    const entry = buildRooModeEntry(baseInput).entry;
    const result = mergeRooModes([existingMode], entry);
    expect(result).toHaveLength(1);
    expect(result[0]?.["roleDefinition"]).toBe("You are a code reviewer.");
  });

  it("replaces manual mode with same slug", () => {
    const manualMode = {
      slug: "code-reviewer",
      name: "Code Reviewer",
      roleDefinition: "Manual definition",
      groups: ["read", "edit"],
    };
    const entry = buildRooModeEntry(baseInput).entry;
    const result = mergeRooModes([manualMode], entry);
    expect(result).toHaveLength(1);
    expect(result[0]?.["roleDefinition"]).toBe("You are a code reviewer.");
  });
});

describe("removeRooMode", () => {
  it("removes mode by slug", () => {
    const existingMode = {
      slug: "code-reviewer",
      name: "code-reviewer",
      roleDefinition: "...",
      groups: ["read"],
    };
    const result = removeRooMode([existingMode], "code-reviewer");
    expect(result).toHaveLength(0);
  });

  it("removes manual mode with same slug", () => {
    const manualMode = {
      slug: "code-reviewer",
      name: "Code Reviewer",
      roleDefinition: "Manual",
      groups: ["read"],
    };
    const result = removeRooMode([manualMode], "code-reviewer");
    expect(result).toHaveLength(0);
  });

  it("preserves other modes", () => {
    const mode1 = {
      slug: "code-reviewer",
      roleDefinition: "...",
      groups: [],
    };
    const mode2 = {
      slug: "test-writer",
      roleDefinition: "...",
      groups: [],
    };
    const result = removeRooMode([mode1, mode2], "code-reviewer");
    expect(result).toHaveLength(1);
    expect(result[0]?.["slug"]).toBe("test-writer");
  });
});
