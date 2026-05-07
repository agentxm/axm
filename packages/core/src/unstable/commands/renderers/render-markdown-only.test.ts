import { describe, expect, it } from "vitest";
import { renderMarkdownOnly } from "./render-markdown-only.js";
import type { CommandRenderOutcome, RenderInput, RenderOutput } from "./types.js";

const firstOutput = (result: CommandRenderOutcome): RenderOutput => {
  if (result._tag !== "Rendered") throw new Error(`Expected Rendered, got ${result._tag}`);
  const output = result.outputs[0];
  if (output === undefined) throw new Error("Expected one output");
  return output;
};

describe("renderMarkdownOnly", () => {
  it("renders body with no frontmatter", () => {
    const input: RenderInput = {
      frontmatter: {},
      body: "Review the code.",
      agentId: "cursor",
      commandName: "review",
      agentOverrides: undefined,
    };

    const output = firstOutput(renderMarkdownOnly(input));

    expect(output.content).toBe("Review the code.");
    expect(output.content).not.toContain("---");
    expect(output.relativePath).toBe("review.md");
    expect(output.warnings).toEqual([]);
  });

  it("drops frontmatter without warnings", () => {
    const output = firstOutput(
      renderMarkdownOnly({
        frontmatter: {
          model: "claude-sonnet-4-20250514",
          "allowed-tools": ["bash:*"],
          custom: true,
        },
        body: "Body.",
        agentId: "cursor",
        commandName: "test",
        agentOverrides: { model: "override" },
      }),
    );

    expect(output.content).toBe("Body.");
    expect(output.content).not.toContain("model");
    expect(output.warnings).toEqual([]);
  });

  it("substitutes variables for cursor", () => {
    const output = firstOutput(
      renderMarkdownOnly({
        frontmatter: {},
        body: "Run with {{arguments}}",
        agentId: "cursor",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("$ARGUMENTS");
  });

  it("renders empty body", () => {
    const output = firstOutput(
      renderMarkdownOnly({
        frontmatter: {},
        body: "",
        agentId: "cursor",
        commandName: "empty",
        agentOverrides: undefined,
      }),
    );
    expect(output.content).toBe("");
  });
});
