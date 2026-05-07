import { describe, expect, it } from "vitest";
import { renderPlainText } from "./render-plain-text.js";
import type { CommandRenderOutcome, RenderOutput } from "./types.js";

const firstOutput = (result: CommandRenderOutcome): RenderOutput => {
  if (result._tag !== "Rendered") throw new Error(`Expected Rendered, got ${result._tag}`);
  const output = result.outputs[0];
  if (output === undefined) throw new Error("Expected one output");
  return output;
};

describe("renderPlainText", () => {
  it("renders with .txt relative path", () => {
    const output = firstOutput(
      renderPlainText({
        frontmatter: {},
        body: "Review the code.",
        agentId: "kiro-cli",
        commandName: "review",
        agentOverrides: undefined,
      }),
    );

    expect(output.relativePath).toBe("review.txt");
  });

  it("renders plain text body", () => {
    const output = firstOutput(
      renderPlainText({
        frontmatter: {},
        body: "Body.",
        agentId: "kiro-cli",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );
    expect(output.content).toBe("Body.");
  });

  it("warns when frontmatter is dropped", () => {
    const output = firstOutput(
      renderPlainText({
        frontmatter: { model: "some-model" },
        body: "Body.",
        agentId: "kiro-cli",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );

    expect(output.warnings.some((w) => w.feature === "frontmatter")).toBe(true);
  });

  it("warns when agent overrides produce dropped frontmatter", () => {
    const output = firstOutput(
      renderPlainText({
        frontmatter: {},
        body: "Body.",
        agentId: "kiro-cli",
        commandName: "test",
        agentOverrides: { model: "override" },
      }),
    );

    expect(output.warnings.some((w) => w.feature === "frontmatter")).toBe(true);
  });

  it("renders variables as literal text with warnings", () => {
    const output = firstOutput(
      renderPlainText({
        frontmatter: {},
        body: "Run with {{arguments}} and {{arg:scope}}",
        agentId: "kiro-cli",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("{{arguments}}");
    expect(output.content).toContain("{{arg:scope}}");
    expect(output.warnings.some((w) => w.feature === "variables")).toBe(true);
  });

  it("renders empty body", () => {
    const output = firstOutput(
      renderPlainText({
        frontmatter: {},
        body: "",
        agentId: "kiro-cli",
        commandName: "empty",
        agentOverrides: undefined,
      }),
    );
    expect(output.content).toBe("");
  });
});
