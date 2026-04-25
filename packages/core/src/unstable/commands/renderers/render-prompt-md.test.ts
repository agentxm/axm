import { describe, expect, it } from "vitest";
import { renderPromptMd } from "./render-prompt-md.js";
import type { RenderInput } from "./types.js";

describe("renderPromptMd", () => {
  it("renders with .prompt.md extension", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review the code.",
      agentId: "github-copilot",
      commandName: "review",
    };

    const result = renderPromptMd(input);

    expect(result.fileExtension).toBe(".prompt.md");
    expect(result.content).toBe("Review the code.");
  });

  it("renders description in frontmatter", () => {
    const input: RenderInput = {
      frontmatter: { description: "Review PR changes" },
      body: "Body.",
      agentId: "github-copilot",
      commandName: "review",
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("---");
    expect(result.content).toContain("description: Review PR changes");
  });

  it("maps model to frontmatter", () => {
    const input: RenderInput = {
      frontmatter: { model: "gpt-4" },
      body: "Body.",
      agentId: "github-copilot",
      commandName: "test",
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("model: gpt-4");
  });

  it("maps allowedTools to tools in frontmatter", () => {
    const input: RenderInput = {
      frontmatter: { allowedTools: ["bash:*", "read"] },
      body: "Body.",
      agentId: "github-copilot",
      commandName: "test",
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("tools:");
    expect(result.content).toContain("bash:*");
    expect(result.content).toContain("read");
  });

  it("warns for isolatedContext", () => {
    const input: RenderInput = {
      frontmatter: { isolatedContext: true },
      body: "Body.",
      agentId: "github-copilot",
      commandName: "test",
    };

    const result = renderPromptMd(input);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.feature).toBe("isolatedContext");
  });

  it("substitutes {{arguments}} to ${input:args}", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Run with {{arguments}}",
      agentId: "github-copilot",
      commandName: "run",
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("${input:args}");
  });

  it("substitutes {{arguments[0]}} to ${input:arg1}", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "File: {{arguments[0]}}",
      agentId: "github-copilot",
      commandName: "run",
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("${input:arg1}");
  });

  it("substitutes {{arg:name}} to ${input:name}", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review {{arg:scope}}",
      agentId: "github-copilot",
      commandName: "run",
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("${input:scope}");
  });

  it("applies agent overrides", () => {
    const input: RenderInput = {
      frontmatter: { description: "Original" },
      body: "Body.",
      agentId: "github-copilot",
      commandName: "test",
      agentOverrides: { description: "Overridden" },
    };

    const result = renderPromptMd(input);

    expect(result.content).toContain("description: Overridden");
    expect(result.content).not.toContain("Original");
  });

  it("renders minimal command with no frontmatter fields", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Just a body.",
      agentId: "github-copilot",
      commandName: "simple",
    };

    const result = renderPromptMd(input);

    expect(result.content).not.toContain("---");
    expect(result.content).toContain("Just a body.");
    expect(result.warnings).toEqual([]);
  });
});
