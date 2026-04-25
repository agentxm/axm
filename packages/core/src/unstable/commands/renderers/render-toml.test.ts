import { describe, expect, it } from "vitest";
import { renderToml } from "./render-toml.js";
import type { RenderInput } from "./types.js";

describe("renderToml", () => {
  it("renders with .toml extension", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review the code.",
      agentId: "gemini-cli",
      commandName: "review",
    };

    const result = renderToml(input);

    expect(result.fileExtension).toBe(".toml");
  });

  it("starts with TOML content", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);
    const firstLine = result.content.split("\n")[0];
    expect(firstLine).toBe('prompt = "Body."');
  });

  it("renders description and prompt fields", () => {
    const input: RenderInput = {
      frontmatter: { description: "Review PR changes" },
      body: "Review the code.",
      agentId: "gemini-cli",
      commandName: "review",
    };

    const result = renderToml(input);

    expect(result.content).toContain('description = "Review PR changes"');
    expect(result.content).toContain('prompt = "Review the code."');
  });

  it("uses multiline string for multiline body", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Line 1\nLine 2\nLine 3",
      agentId: "gemini-cli",
      commandName: "multi",
    };

    const result = renderToml(input);

    expect(result.content).toContain('prompt = """\nLine 1\nLine 2\nLine 3"""');
  });

  it("substitutes {{arguments}} to {{args}}", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Run with {{arguments}}",
      agentId: "gemini-cli",
      commandName: "run",
    };

    const result = renderToml(input);

    expect(result.content).toContain("{{args}}");
    expect(result.content).not.toContain("{{arguments}}");
  });

  it("warns for model", () => {
    const input: RenderInput = {
      frontmatter: { model: "gemini-pro" },
      body: "Body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.warnings.some((w) => w.feature === "model")).toBe(true);
  });

  it("warns for allowedTools", () => {
    const input: RenderInput = {
      frontmatter: { allowedTools: ["tool"] },
      body: "Body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.warnings.some((w) => w.feature === "allowedTools")).toBe(true);
  });

  it("warns for isolatedContext", () => {
    const input: RenderInput = {
      frontmatter: { isolatedContext: true },
      body: "Body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.warnings.some((w) => w.feature === "isolatedContext")).toBe(true);
  });

  it("warns for arguments", () => {
    const input: RenderInput = {
      frontmatter: {
        arguments: [{ name: "scope", description: "Area to review" }],
      },
      body: "Body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.warnings.some((w) => w.feature === "arguments")).toBe(true);
  });

  it("accumulates all warnings", () => {
    const input: RenderInput = {
      frontmatter: {
        model: "model",
        allowedTools: ["tool"],
        isolatedContext: true,
        arguments: [{ name: "x" }],
      },
      body: "Body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.warnings).toHaveLength(4);
  });

  it("renders without description when not provided", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Simple body.",
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.content).not.toContain("description =");
    expect(result.content).toContain('prompt = "Simple body."');
  });

  it("escapes quotes in single-line body", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: 'Say "hello" world',
      agentId: "gemini-cli",
      commandName: "test",
    };

    const result = renderToml(input);

    expect(result.content).toContain('prompt = "Say \\"hello\\" world"');
  });
});
