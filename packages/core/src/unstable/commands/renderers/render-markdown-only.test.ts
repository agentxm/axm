import { describe, expect, it } from "vitest";
import { renderMarkdownOnly } from "./render-markdown-only.js";
import type { RenderInput } from "./types.js";

describe("renderMarkdownOnly", () => {
  it("renders body with managed marker and no frontmatter", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review the code.",
      agentId: "cursor",
      commandName: "review",
    };

    const result = renderMarkdownOnly(input);

    expect(result.content).toContain("Managed by axm");
    expect(result.content).toContain("Review the code.");
    expect(result.content).not.toContain("---");
    expect(result.fileExtension).toBe(".md");
    expect(result.warnings).toEqual([]);
  });

  it("warns for model specification", () => {
    const input: RenderInput = {
      frontmatter: { model: "claude-sonnet-4-20250514" },
      body: "Body.",
      agentId: "cursor",
      commandName: "test",
    };

    const result = renderMarkdownOnly(input);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.feature).toBe("model");
    expect(result.warnings[0]?.agent).toBe("cursor");
  });

  it("warns for allowedTools", () => {
    const input: RenderInput = {
      frontmatter: { allowedTools: ["bash:*"] },
      body: "Body.",
      agentId: "cursor",
      commandName: "test",
    };

    const result = renderMarkdownOnly(input);

    expect(result.warnings.some((w) => w.feature === "allowedTools")).toBe(true);
  });

  it("warns for isolatedContext", () => {
    const input: RenderInput = {
      frontmatter: { isolatedContext: true },
      body: "Body.",
      agentId: "cursor",
      commandName: "test",
    };

    const result = renderMarkdownOnly(input);

    expect(result.warnings.some((w) => w.feature === "isolatedContext")).toBe(true);
  });

  it("does not warn for false isolatedContext", () => {
    const input: RenderInput = {
      frontmatter: { isolatedContext: false },
      body: "Body.",
      agentId: "cursor",
      commandName: "test",
    };

    const result = renderMarkdownOnly(input);

    expect(result.warnings).toEqual([]);
  });

  it("does not warn for null model or allowedTools", () => {
    const input: RenderInput = {
      frontmatter: { model: null, allowedTools: null },
      body: "Body.",
      agentId: "cursor",
      commandName: "test",
    };

    const result = renderMarkdownOnly(input);

    expect(result.warnings).toEqual([]);
  });

  it("accumulates multiple warnings", () => {
    const input: RenderInput = {
      frontmatter: {
        model: "some-model",
        allowedTools: ["tool"],
        isolatedContext: true,
      },
      body: "Body.",
      agentId: "cursor",
      commandName: "test",
    };

    const result = renderMarkdownOnly(input);

    expect(result.warnings).toHaveLength(3);
  });

  it("substitutes variables for cursor", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Run with {{arguments}}",
      agentId: "cursor",
      commandName: "run",
    };

    const result = renderMarkdownOnly(input);

    expect(result.content).toContain("$ARGUMENTS");
  });

  it("renders empty body", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "",
      agentId: "cursor",
      commandName: "empty",
    };

    const result = renderMarkdownOnly(input);
    const lines = result.content.split("\n");
    expect(lines[0]).toMatch(/^<!-- Managed by axm/);
    expect(lines).toHaveLength(1);
  });
});
