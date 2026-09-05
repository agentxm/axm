import { describe, expect, it } from "vitest";
import { renderMarkdownYaml } from "./markdown-yaml.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "claude-code",
  name: "code-reviewer",
  body: "You are a code reviewer. Review all changes carefully.",
  frontmatter: {
    name: "code-reviewer",
    description: "Reviews code changes for quality",
  },
  agentOverrides: undefined,
};

describe("renderMarkdownYaml", () => {
  it("renders frontmatter and body", () => {
    const result = renderMarkdownYaml(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;

    expect(result.outputs).toHaveLength(1);
    const output = result.outputs[0];
    expect(output?.path).toBe(".claude/agents/code-reviewer.md");
    expect(output?.content).toContain("---");
    expect(output?.content).toContain("name: code-reviewer");
    expect(output?.content).toContain("description: Reviews code changes for quality");
    expect(output?.content).toContain("You are a code reviewer.");
  });

  it("starts with frontmatter as first line", () => {
    const result = renderMarkdownYaml(baseInput);
    if (result._tag !== "Rendered") return;
    const firstLine = result.outputs[0]?.content.split("\n")[0];
    expect(firstLine).toBe("---");
  });

  it("passes arbitrary frontmatter keys through verbatim", () => {
    const result = renderMarkdownYaml({
      ...baseInput,
      frontmatter: {
        name: "code-reviewer",
        model: "claude-opus-4-6",
        disallowedTools: "Edit,Write,Bash",
        custom: { nested: 1 },
      },
    });
    if (result._tag !== "Rendered") return;
    const content = result.outputs[0]?.content ?? "";
    expect(content).toContain("model: claude-opus-4-6");
    expect(content).toContain("disallowedTools: Edit,Write,Bash");
    expect(content).toContain("nested: 1");
  });

  describe("overrides", () => {
    it("merges overrides on top of frontmatter", () => {
      const result = renderMarkdownYaml({
        ...baseInput,
        agentOverrides: {
          permissionMode: "acceptEdits",
          effort: "high",
        },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("permissionMode: acceptEdits");
      expect(result.outputs[0]?.content).toContain("effort: high");
    });

    it("override replaces a frontmatter field", () => {
      const result = renderMarkdownYaml({
        ...baseInput,
        frontmatter: { name: "code-reviewer", model: "haiku" },
        agentOverrides: { model: "opus" },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("model: opus");
      expect(result.outputs[0]?.content).not.toContain("model: haiku");
    });

    it("null override removes a frontmatter field", () => {
      const result = renderMarkdownYaml({
        ...baseInput,
        frontmatter: {
          name: "code-reviewer",
          disallowedTools: "Edit,Write,Bash",
        },
        agentOverrides: { disallowedTools: null },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).not.toContain("disallowedTools");
    });

    it("null override on absent field is a no-op", () => {
      const result = renderMarkdownYaml({
        ...baseInput,
        agentOverrides: { neverEmitted: null },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).not.toContain("neverEmitted");
    });
  });

  describe("agent-specific paths", () => {
    it.each([
      ["claude-code", ".claude/agents/code-reviewer.md"],
      ["github-copilot-cli", ".github/agents/code-reviewer.md"],
      ["cursor", ".cursor/agents/code-reviewer.md"],
      ["gemini-cli", ".gemini/agents/code-reviewer.md"],
      ["opencode", ".opencode/agents/code-reviewer.md"],
      ["augment", ".augment/agents/code-reviewer.md"],
      ["junie", ".junie/agents/code-reviewer.md"],
      ["kilo-code", ".kilo/agents/code-reviewer.md"],
      ["kiro", ".kiro/agents/code-reviewer.md"],
    ])("renders to correct path for %s", (agentId, expectedPath) => {
      const result = renderMarkdownYaml({ ...baseInput, agentId });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.path).toBe(expectedPath);
    });

    it("falls back to .<agent>/agents/ for unknown agents", () => {
      const result = renderMarkdownYaml({ ...baseInput, agentId: "novel-agent" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.path).toBe(".novel-agent/agents/code-reviewer.md");
    });
  });

  it("renders empty body without trailing content", () => {
    const result = renderMarkdownYaml({ ...baseInput, body: "" });
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.content.endsWith("---")).toBe(true);
  });
});
