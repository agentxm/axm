import { describe, expect, it } from "vitest";
import { renderMarkdownWithFrontmatter } from "./render-markdown-with-frontmatter.js";
import type { CommandRenderOutcome, RenderInput, RenderOutput } from "./types.js";

const baseInput: RenderInput = {
  frontmatter: {},
  body: "Review the code changes.",
  agentId: "claude-code",
  commandName: "review",
  agentOverrides: undefined,
};

const firstOutput = (result: CommandRenderOutcome): RenderOutput => {
  if (result._tag !== "Rendered") throw new Error(`Expected Rendered, got ${result._tag}`);
  const output = result.outputs[0];
  if (output === undefined) throw new Error("Expected one output");
  return output;
};

describe("renderMarkdownWithFrontmatter", () => {
  it("renders minimal command with body only", () => {
    const output = firstOutput(renderMarkdownWithFrontmatter(baseInput));

    expect(output.content).toBe("Review the code changes.");
    expect(output.content).not.toContain("---");
    expect(output.relativePath).toBe("review.md");
    expect(output.warnings).toEqual([]);
  });

  it("passes frontmatter through verbatim", () => {
    const input: RenderInput = {
      frontmatter: {
        description: "Review PR changes",
        model: "claude-sonnet-4-20250514",
        "allowed-tools": ["bash:*", "read"],
        "argument-hint": "[scope]",
        "isolated-context": true,
        "auto-invocable": true,
        "user-invocable": false,
      },
      body: "Review the PR with {{arguments}}.",
      agentId: "claude-code",
      commandName: "review",
      agentOverrides: undefined,
    };

    const output = firstOutput(renderMarkdownWithFrontmatter(input));

    expect(output.content).toContain("---");
    expect(output.content).toContain("description: Review PR changes");
    expect(output.content).toContain("model: claude-sonnet-4-20250514");
    expect(output.content).toContain('argument-hint: "[scope]"');
    expect(output.content).toContain("isolated-context: true");
    expect(output.content).toContain("auto-invocable: true");
    expect(output.content).toContain("user-invocable: false");
    expect(output.content).toContain("bash:*");
    expect(output.content).toContain("read");
    expect(output.content).toContain("$ARGUMENTS");
  });

  it("does not translate camelCase frontmatter names", () => {
    const output = firstOutput(
      renderMarkdownWithFrontmatter({
        frontmatter: { argumentHint: "[scope]", allowedTools: ["Read"] },
        body: "Body.",
        agentId: "claude-code",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("argumentHint:");
    expect(output.content).toContain("allowedTools:");
    expect(output.content).not.toContain("argument-hint:");
    expect(output.content).not.toContain("allowed-tools:");
  });

  it("deep-merges agent overrides on top of frontmatter", () => {
    const input: RenderInput = {
      frontmatter: {
        description: "Original description",
        config: {
          keep: true,
          remove: true,
          tools: ["Read", "Write"],
        },
      },
      body: "Body text.",
      agentId: "claude-code",
      commandName: "test",
      agentOverrides: {
        description: "Overridden description",
        config: {
          remove: null,
          tools: ["Bash"],
          add: true,
        },
      },
    };

    const output = firstOutput(renderMarkdownWithFrontmatter(input));

    expect(output.content).toContain("description: Overridden description");
    expect(output.content).toContain("keep: true");
    expect(output.content).toContain("add: true");
    expect(output.content).toContain("Bash");
    expect(output.content).not.toContain("Original description");
    expect(output.content).not.toContain("remove:");
    expect(output.content).not.toContain("Write");
  });

  it("substitutes variables for different agents in the family", () => {
    const output = firstOutput(
      renderMarkdownWithFrontmatter({
        frontmatter: {},
        body: "Run {{arguments[0]}} on {{arguments[1]}}",
        agentId: "codex",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("$1");
    expect(output.content).toContain("$2");
  });

  it("starts with frontmatter when present", () => {
    const output = firstOutput(
      renderMarkdownWithFrontmatter({
        frontmatter: { description: "Needs frontmatter" },
        body: "Body.",
        agentId: "claude-code",
        commandName: "frontmatter",
        agentOverrides: undefined,
      }),
    );
    const firstLine = output.content.split("\n")[0];
    expect(firstLine).toBe("---");
  });

  it("renders empty body without trailing content", () => {
    const output = firstOutput(
      renderMarkdownWithFrontmatter({
        frontmatter: { description: "Empty body command" },
        body: "",
        agentId: "claude-code",
        commandName: "empty",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("description: Empty body command");
    expect(output.content.endsWith("---")).toBe(true);
  });
});
