import { describe, expect, it } from "vitest";
import { renderPromptMd } from "./render-prompt-md.js";
import type { CommandRenderOutcome, RenderInput, RenderOutput } from "./types.js";

const firstOutput = (result: CommandRenderOutcome): RenderOutput => {
  if (result._tag !== "Rendered") throw new Error(`Expected Rendered, got ${result._tag}`);
  const output = result.outputs[0];
  if (output === undefined) throw new Error("Expected one output");
  return output;
};

describe("renderPromptMd", () => {
  it("renders with .prompt.md relative path", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review the code.",
      agentId: "github-copilot",
      commandName: "review",
      agentOverrides: undefined,
    };

    const output = firstOutput(renderPromptMd(input));

    expect(output.relativePath).toBe("review.prompt.md");
    expect(output.content).toBe("Review the code.");
  });

  it("passes frontmatter through verbatim", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: {
          description: "Review PR changes",
          tools: ["bash:*", "read"],
          mode: "agent",
        },
        body: "Body.",
        agentId: "github-copilot",
        commandName: "review",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("---");
    expect(output.content).toContain("description: Review PR changes");
    expect(output.content).toContain("tools:");
    expect(output.content).toContain("mode: agent");
  });

  it("does not map allowedTools to tools", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: { allowedTools: ["bash:*"] },
        body: "Body.",
        agentId: "github-copilot",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("allowedTools:");
    expect(output.content).not.toContain("tools:");
  });

  it("substitutes {{arguments}} to ${input:args}", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: {},
        body: "Run with {{arguments}}",
        agentId: "github-copilot",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("${input:args}");
  });

  it("substitutes {{arguments[0]}} to ${input:arg1}", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: {},
        body: "File: {{arguments[0]}}",
        agentId: "github-copilot",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("${input:arg1}");
  });

  it("substitutes {{arg:name}} to ${input:name}", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: {},
        body: "Review {{arg:scope}}",
        agentId: "github-copilot",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("${input:scope}");
  });

  it("deep-merges agent overrides", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: { description: "Original", config: { keep: true, drop: true } },
        body: "Body.",
        agentId: "github-copilot",
        commandName: "test",
        agentOverrides: { description: "Overridden", config: { drop: null, add: true } },
      }),
    );

    expect(output.content).toContain("description: Overridden");
    expect(output.content).toContain("keep: true");
    expect(output.content).toContain("add: true");
    expect(output.content).not.toContain("Original");
    expect(output.content).not.toContain("drop:");
  });

  it("renders minimal command with no frontmatter fields", () => {
    const output = firstOutput(
      renderPromptMd({
        frontmatter: {},
        body: "Just a body.",
        agentId: "github-copilot",
        commandName: "simple",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).not.toContain("---");
    expect(output.content).toContain("Just a body.");
    expect(output.warnings).toEqual([]);
  });
});
