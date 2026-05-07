import { describe, expect, it } from "vitest";
import { renderToml } from "./render-toml.js";
import type { CommandRenderOutcome, RenderOutput } from "./types.js";

const firstOutput = (result: CommandRenderOutcome): RenderOutput => {
  if (result._tag !== "Rendered") throw new Error(`Expected Rendered, got ${result._tag}`);
  const output = result.outputs[0];
  if (output === undefined) throw new Error("Expected one output");
  return output;
};

describe("renderToml", () => {
  it("renders with .toml relative path", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {},
        body: "Review the code.",
        agentId: "gemini-cli",
        commandName: "review",
        agentOverrides: undefined,
      }),
    );

    expect(output.relativePath).toBe("review.toml");
  });

  it("supports nested command names as relative paths", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {},
        body: "Commit changes.",
        agentId: "gemini-cli",
        commandName: "git/commit",
        agentOverrides: undefined,
      }),
    );

    expect(output.relativePath).toBe("git/commit.toml");
  });

  it("starts with TOML content", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {},
        body: "Body.",
        agentId: "gemini-cli",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );
    const firstLine = output.content.split("\n")[0];
    expect(firstLine).toBe('prompt = "Body."');
  });

  it("renders opaque frontmatter and prompt fields", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: { description: "Review PR changes", count: 2, enabled: true },
        body: "Review the code.",
        agentId: "gemini-cli",
        commandName: "review",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain('description = "Review PR changes"');
    expect(output.content).toContain("count = 2");
    expect(output.content).toContain("enabled = true");
    expect(output.content).toContain('prompt = "Review the code."');
  });

  it("uses multiline string for multiline body", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {},
        body: "Line 1\nLine 2\nLine 3",
        agentId: "gemini-cli",
        commandName: "multi",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain('prompt = """\nLine 1\nLine 2\nLine 3"""');
  });

  it("substitutes {{arguments}} to {{args}}", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {},
        body: "Run with {{arguments}}",
        agentId: "gemini-cli",
        commandName: "run",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain("{{args}}");
    expect(output.content).not.toContain("{{arguments}}");
  });

  it("deep-merges agent overrides", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {
          description: "Original",
          config: { keep: true, drop: true, tools: ["Read", "Write"] },
        },
        body: "Body.",
        agentId: "gemini-cli",
        commandName: "test",
        agentOverrides: {
          description: "Overridden",
          config: { drop: null, tools: ["Bash"], add: true },
        },
      }),
    );

    expect(output.content).toContain('description = "Overridden"');
    expect(output.content).toContain("[config]");
    expect(output.content).toContain("keep = true");
    expect(output.content).toContain('tools = ["Bash"]');
    expect(output.content).toContain("add = true");
    expect(output.content).not.toContain("drop");
    expect(output.content).not.toContain("Write");
  });

  it("frontmatter prompt does not override body prompt", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: { prompt: "Frontmatter prompt" },
        body: "Body prompt.",
        agentId: "gemini-cli",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain('prompt = "Body prompt."');
    expect(output.content).not.toContain("Frontmatter prompt");
  });

  it("escapes quotes in single-line body", () => {
    const output = firstOutput(
      renderToml({
        frontmatter: {},
        body: 'Say "hello" world',
        agentId: "gemini-cli",
        commandName: "test",
        agentOverrides: undefined,
      }),
    );

    expect(output.content).toContain('prompt = "Say \\"hello\\" world"');
  });
});
