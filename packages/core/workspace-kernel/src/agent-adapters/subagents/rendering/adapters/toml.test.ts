import { describe, expect, it } from "vitest";
import { renderToml } from "./toml.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "codex",
  name: "code-reviewer",
  body: "You are a code reviewer.",
  frontmatter: {
    name: "code-reviewer",
    description: "Reviews code changes",
  },
  agentOverrides: undefined,
};

describe("renderToml", () => {
  it("renders with .toml extension path", () => {
    const result = renderToml(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.path).toBe(".codex/agents/code-reviewer.toml");
  });

  it("emits frontmatter keys before body field", () => {
    const result = renderToml(baseInput);
    if (result._tag !== "Rendered") return;
    const content = result.outputs[0]?.content ?? "";
    expect(content).toContain('name = "code-reviewer"');
    expect(content).toContain('description = "Reviews code changes"');
    expect(content).toContain('developer_instructions = "You are a code reviewer."');
  });

  it("uses multiline string for multiline body", () => {
    const result = renderToml({ ...baseInput, body: "Line 1\nLine 2\nLine 3" });
    if (result._tag !== "Rendered") return;
    const content = result.outputs[0]?.content ?? "";
    expect(content).toContain('developer_instructions = """\nLine 1\nLine 2\nLine 3"""');
  });

  it("passes arbitrary frontmatter keys through", () => {
    const result = renderToml({
      ...baseInput,
      frontmatter: {
        name: "code-reviewer",
        sandbox_mode: "read-only",
        model: "gpt-5-codex",
      },
    });
    if (result._tag !== "Rendered") return;
    const content = result.outputs[0]?.content ?? "";
    expect(content).toContain('sandbox_mode = "read-only"');
    expect(content).toContain('model = "gpt-5-codex"');
  });

  describe("overrides", () => {
    it("override replaces a frontmatter field", () => {
      const result = renderToml({
        ...baseInput,
        frontmatter: {
          name: "code-reviewer",
          sandbox_mode: "read-only",
        },
        agentOverrides: { sandbox_mode: "workspace-write" },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain('sandbox_mode = "workspace-write"');
      expect(result.outputs[0]?.content).not.toContain('sandbox_mode = "read-only"');
    });

    it("adds new fields from overrides", () => {
      const result = renderToml({
        ...baseInput,
        agentOverrides: { model_reasoning_effort: "high" },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain('model_reasoning_effort = "high"');
    });

    it("null override removes a frontmatter field", () => {
      const result = renderToml({
        ...baseInput,
        frontmatter: {
          name: "code-reviewer",
          sandbox_mode: "read-only",
        },
        agentOverrides: { sandbox_mode: null },
      });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).not.toContain("sandbox_mode");
    });

    it("preserves boolean and number values without quoting", () => {
      const result = renderToml({
        ...baseInput,
        agentOverrides: { verbose: true, retries: 3 },
      });
      if (result._tag !== "Rendered") return;
      const content = result.outputs[0]?.content ?? "";
      expect(content).toContain("verbose = true");
      expect(content).toContain("retries = 3");
    });
  });
});
