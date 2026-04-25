import { describe, expect, it } from "vitest";
import { renderMarkdownYaml } from "./markdown-yaml.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "claude-code",
  name: "code-reviewer",
  description: "Reviews code changes for quality",
  model: undefined,
  toolAccess: undefined,
  background: undefined,
  body: "You are a code reviewer. Review all changes carefully.",
  agentOverrides: undefined,
};

describe("renderMarkdownYaml", () => {
  it("renders basic subagent for Claude Code", () => {
    const result = renderMarkdownYaml(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;

    expect(result.outputs).toHaveLength(1);
    const output = result.outputs[0];
    expect(output?.path).toBe(".claude/agents/code-reviewer.md");
    expect(output?.content).toContain("---");
    expect(output?.content).toContain("description: Reviews code changes for quality");
    expect(output?.content).toContain("You are a code reviewer.");
  });

  it("starts with frontmatter as first line", () => {
    const result = renderMarkdownYaml(baseInput);
    if (result._tag !== "Rendered") return;
    const firstLine = result.outputs[0]?.content.split("\n")[0];
    expect(firstLine).toBe("---");
  });

  describe("model tiers", () => {
    it("maps fast to haiku for Claude Code", () => {
      const result = renderMarkdownYaml({ ...baseInput, model: "fast" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("model: haiku");
    });

    it("maps powerful to opus for Claude Code", () => {
      const result = renderMarkdownYaml({ ...baseInput, model: "powerful" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("model: opus");
    });

    it("passes through concrete model IDs", () => {
      const result = renderMarkdownYaml({ ...baseInput, model: "claude-opus-4-6" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("model: claude-opus-4-6");
    });

    it("maps inherit to inherit for Claude Code", () => {
      const result = renderMarkdownYaml({ ...baseInput, model: "inherit" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("model: inherit");
    });
  });

  describe("tool access", () => {
    it("omits tool fields for full access", () => {
      const result = renderMarkdownYaml({ ...baseInput, toolAccess: "full" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).not.toContain("disallowedTools");
      expect(result.outputs[0]?.content).not.toContain("tools:");
    });

    it("sets disallowedTools for readonly (Claude Code)", () => {
      const result = renderMarkdownYaml({ ...baseInput, toolAccess: "readonly" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("disallowedTools: Edit,Write,Bash");
    });

    it("sets empty tools for none (Claude Code)", () => {
      const result = renderMarkdownYaml({ ...baseInput, toolAccess: "none" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain('tools: ""');
    });
  });

  describe("background", () => {
    it("includes background for Claude Code", () => {
      const result = renderMarkdownYaml({ ...baseInput, background: true });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain("background: true");
      expect(result.warnings).toEqual([]);
    });

    it("warns for unsupported agents", () => {
      const result = renderMarkdownYaml({
        ...baseInput,
        agentId: "gemini-cli",
        background: true,
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).not.toContain("background:");
      expect(result.warnings.some((w) => w.feature === "background")).toBe(true);
    });
  });

  describe("overrides", () => {
    it("merges overrides on top of portable fields", () => {
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

    it("override takes precedence over portable mapping", () => {
      const result = renderMarkdownYaml({
        ...baseInput,
        toolAccess: "readonly",
        agentOverrides: {
          disallowedTools: "Write",
        },
      });
      if (result._tag !== "Rendered") return;
      // Override should win — only "Write", not "Edit,Write,Bash"
      expect(result.outputs[0]?.content).toContain("disallowedTools: Write");
      expect(result.outputs[0]?.content).not.toContain("Edit,Write,Bash");
    });
  });

  describe("agent-specific paths", () => {
    it.each([
      ["claude-code", ".claude/agents/code-reviewer.md"],
      ["github-copilot", ".github/agents/code-reviewer.md"],
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
  });

  it("renders for Cursor with readonly tool access", () => {
    const result = renderMarkdownYaml({
      ...baseInput,
      agentId: "cursor",
      toolAccess: "readonly",
    });
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.content).toContain("readonly: true");
  });

  it("renders for Copilot with full tool access", () => {
    const result = renderMarkdownYaml({
      ...baseInput,
      agentId: "github-copilot",
      toolAccess: "full",
    });
    if (result._tag !== "Rendered") return;
    const content = result.outputs[0]?.content ?? "";
    expect(content).toContain('- "*"');
  });

  it("renders empty body without trailing content", () => {
    const result = renderMarkdownYaml({ ...baseInput, body: "" });
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.content.endsWith("---")).toBe(true);
  });
});
