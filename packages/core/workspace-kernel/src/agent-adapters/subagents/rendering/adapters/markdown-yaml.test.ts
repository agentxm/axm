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
};

describe("renderMarkdownYaml", () => {
  it("renders frontmatter and body", () => {
    const result = renderMarkdownYaml(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;

    expect(result.outputs).toHaveLength(1);
    const output = result.outputs[0];
    expect(output?.path).toBe("code-reviewer.md");
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

  describe("native filenames independent of agent paths", () => {
    it.each([
      ["claude-code", "code-reviewer.md"],
      ["github-copilot-cli", "code-reviewer.md"],
      ["cursor", "code-reviewer.md"],
      ["gemini-cli", "code-reviewer.md"],
      ["opencode", "code-reviewer.md"],
      ["augment", "code-reviewer.md"],
      ["junie", "code-reviewer.md"],
      ["kilo-code", "code-reviewer.md"],
      ["kiro", "code-reviewer.md"],
    ])("renders the native filename for %s", (agentId, expectedPath) => {
      const result = renderMarkdownYaml({ ...baseInput, agentId });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.path).toBe(expectedPath);
    });

    it("does not invent an agent directory for unknown agents", () => {
      const result = renderMarkdownYaml({ ...baseInput, agentId: "novel-agent" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.path).toBe("code-reviewer.md");
    });
  });

  it("renders empty body without trailing content", () => {
    const result = renderMarkdownYaml({ ...baseInput, body: "" });
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.content.endsWith("---")).toBe(true);
  });
});
