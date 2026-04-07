import { describe, expect, it } from "vitest";
import { renderPlainText } from "./render-plain-text.js";
import type { RenderInput } from "./types.js";

describe("renderPlainText", () => {
  it("renders with .txt extension", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review the code.",
      agentId: "kiro-cli",
      commandName: "review",
    };

    const result = renderPlainText(input);

    expect(result.fileExtension).toBe(".txt");
  });

  it("renders managed-by marker as hash comment", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Body.",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);
    const firstLine = result.content.split("\n")[0];
    expect(firstLine).toMatch(/^# Managed by axm/);
  });

  it("renders body after marker", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Do the thing.",
      agentId: "kiro-cli",
      commandName: "thing",
    };

    const result = renderPlainText(input);

    expect(result.content).toContain("Do the thing.");
  });

  it("warns for model", () => {
    const input: RenderInput = {
      frontmatter: { model: "some-model" },
      body: "Body.",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);

    expect(result.warnings.some((w) => w.feature === "model")).toBe(true);
  });

  it("warns for allowedTools", () => {
    const input: RenderInput = {
      frontmatter: { allowedTools: ["bash:*"] },
      body: "Body.",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);

    expect(result.warnings.some((w) => w.feature === "allowedTools")).toBe(true);
  });

  it("warns for isolatedContext", () => {
    const input: RenderInput = {
      frontmatter: { isolatedContext: true },
      body: "Body.",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);

    expect(result.warnings.some((w) => w.feature === "isolatedContext")).toBe(true);
  });

  it("warns for arguments", () => {
    const input: RenderInput = {
      frontmatter: { arguments: [{ name: "scope" }] },
      body: "Body.",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);

    expect(result.warnings.some((w) => w.feature === "arguments")).toBe(true);
  });

  it("renders variables as literal text with warnings", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Run with {{arguments}} and {{arg:scope}}",
      agentId: "kiro-cli",
      commandName: "run",
    };

    const result = renderPlainText(input);

    // Variables stay as literal text for kiro
    expect(result.content).toContain("{{arguments}}");
    expect(result.content).toContain("{{arg:scope}}");
    // Variable warnings from substitution engine
    expect(result.warnings.some((w) => w.feature === "variables")).toBe(true);
  });

  it("accumulates frontmatter and variable warnings", () => {
    const input: RenderInput = {
      frontmatter: {
        model: "model",
        allowedTools: ["tool"],
        isolatedContext: true,
        arguments: [{ name: "x" }],
      },
      body: "Use {{arguments}}",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);

    // 4 frontmatter warnings + 1 variable warning
    expect(result.warnings.length).toBeGreaterThanOrEqual(5);
  });

  it("does not warn for null model or allowedTools", () => {
    const input: RenderInput = {
      frontmatter: { model: null, allowedTools: null },
      body: "Body.",
      agentId: "kiro-cli",
      commandName: "test",
    };

    const result = renderPlainText(input);

    expect(result.warnings).toEqual([]);
  });

  it("renders empty body", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "",
      agentId: "kiro-cli",
      commandName: "empty",
    };

    const result = renderPlainText(input);
    const lines = result.content.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^# Managed by axm/);
  });
});
