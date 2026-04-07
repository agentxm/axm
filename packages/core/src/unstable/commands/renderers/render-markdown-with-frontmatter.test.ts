import { describe, expect, it } from "vitest";
import { renderMarkdownWithFrontmatter } from "./render-markdown-with-frontmatter.js";
import type { RenderInput } from "./types.js";

const baseInput: RenderInput = {
  frontmatter: {},
  body: "Review the code changes.",
  agentId: "claude-code",
  commandName: "review",
};

describe("renderMarkdownWithFrontmatter", () => {
  it("renders minimal command with body only", () => {
    const result = renderMarkdownWithFrontmatter(baseInput);

    expect(result.content).toContain("<!-- Managed by axm");
    expect(result.content).toContain("Review the code changes.");
    expect(result.content).not.toContain("---");
    expect(result.fileExtension).toBe(".md");
    expect(result.warnings).toEqual([]);
  });

  it("renders full frontmatter with all fields", () => {
    const input: RenderInput = {
      frontmatter: {
        description: "Review PR changes",
        model: "claude-sonnet-4-20250514",
        allowedTools: ["bash:*", "read"],
        isolatedContext: true,
        argumentHint: "[scope]",
        autoInvocable: true,
        userInvocable: false,
      },
      body: "Review the PR with {{arguments}}.",
      agentId: "claude-code",
      commandName: "review",
    };

    const result = renderMarkdownWithFrontmatter(input);

    expect(result.content).toContain("---");
    expect(result.content).toContain("description: Review PR changes");
    expect(result.content).toContain("model: claude-sonnet-4-20250514");
    expect(result.content).toContain('argument-hint: "[scope]"');
    expect(result.content).toContain("isolated-context: true");
    expect(result.content).toContain("auto-invocable: true");
    expect(result.content).toContain("user-invocable: false");
    expect(result.content).toContain("bash:*");
    expect(result.content).toContain("read");
    expect(result.content).toContain("$ARGUMENTS");
    expect(result.fileExtension).toBe(".md");
  });

  it("applies agent overrides on top of frontmatter", () => {
    const input: RenderInput = {
      frontmatter: {
        description: "Original description",
        model: "original-model",
      },
      body: "Body text.",
      agentId: "claude-code",
      commandName: "test",
      agentOverrides: {
        description: "Overridden description",
        "custom-field": "custom-value",
      },
    };

    const result = renderMarkdownWithFrontmatter(input);

    expect(result.content).toContain("description: Overridden description");
    expect(result.content).toContain("custom-field: custom-value");
    expect(result.content).not.toContain("Original description");
  });

  it("substitutes variables for different agents in the family", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Run {{arguments[0]}} on {{arguments[1]}}",
      agentId: "codex",
      commandName: "run",
    };

    const result = renderMarkdownWithFrontmatter(input);

    expect(result.content).toContain("$1");
    expect(result.content).toContain("$2");
  });

  it("starts with managed-by marker", () => {
    const result = renderMarkdownWithFrontmatter(baseInput);
    const firstLine = result.content.split("\n")[0];
    expect(firstLine).toMatch(/^<!-- Managed by axm/);
  });

  it("renders empty body without trailing content", () => {
    const input: RenderInput = {
      frontmatter: { description: "Empty body command" },
      body: "",
      agentId: "claude-code",
      commandName: "empty",
    };

    const result = renderMarkdownWithFrontmatter(input);

    expect(result.content).toContain("description: Empty body command");
    // Should not have extra blank lines at the end
    expect(result.content.endsWith("---")).toBe(true);
  });

  it("omits null model from frontmatter", () => {
    const input: RenderInput = {
      frontmatter: { model: null },
      body: "Body.",
      agentId: "claude-code",
      commandName: "test",
    };

    const result = renderMarkdownWithFrontmatter(input);

    expect(result.content).not.toContain("model:");
    expect(result.content).not.toContain("---");
  });

  it("omits null allowedTools from frontmatter", () => {
    const input: RenderInput = {
      frontmatter: { allowedTools: null },
      body: "Body.",
      agentId: "claude-code",
      commandName: "test",
    };

    const result = renderMarkdownWithFrontmatter(input);

    expect(result.content).not.toContain("allowed-tools:");
  });

  it("works with all agents in the MD+frontmatter family", () => {
    const agents = ["claude-code", "codex", "opencode", "augment", "junie", "kilo", "roo"];

    for (const agentId of agents) {
      const input: RenderInput = {
        frontmatter: { description: "Test" },
        body: "Body text.",
        agentId,
        commandName: "test",
      };

      const result = renderMarkdownWithFrontmatter(input);
      expect(result.fileExtension).toBe(".md");
      expect(result.content).toContain("Managed by axm");
    }
  });
});
