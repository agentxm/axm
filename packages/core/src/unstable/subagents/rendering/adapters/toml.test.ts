import { describe, expect, it } from "vitest";
import { renderToml } from "./toml.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "codex",
  name: "code-reviewer",
  description: "Reviews code changes",
  model: undefined,
  toolAccess: undefined,
  background: undefined,
  body: "You are a code reviewer.",
  agentOverrides: undefined,
};

describe("renderToml", () => {
  it("renders with .toml extension path", () => {
    const result = renderToml(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.path).toBe(".codex/agents/code-reviewer.toml");
  });

  it("starts with TOML content", () => {
    const result = renderToml(baseInput);
    if (result._tag !== "Rendered") return;
    const firstLine = result.outputs[0]?.content.split("\n")[0];
    expect(firstLine).toBe('name = "code-reviewer"');
  });

  it("includes name, description, and developer_instructions", () => {
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

  describe("tool access", () => {
    it("omits sandbox_mode for full access", () => {
      const result = renderToml({ ...baseInput, toolAccess: "full" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).not.toContain("sandbox_mode");
    });

    it("sets sandbox_mode for readonly", () => {
      const result = renderToml({ ...baseInput, toolAccess: "readonly" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain('sandbox_mode = "read-only"');
    });

    it("sets sandbox_mode for none with warning", () => {
      const result = renderToml({ ...baseInput, toolAccess: "none" });
      if (result._tag !== "Rendered") return;
      expect(result.outputs[0]?.content).toContain('sandbox_mode = "read-only"');
      expect(result.warnings.some((w) => w.feature === "toolAccess")).toBe(true);
    });
  });

  describe("background", () => {
    it("warns when background is true", () => {
      const result = renderToml({ ...baseInput, background: true });
      if (result._tag !== "Rendered") return;
      expect(result.warnings.some((w) => w.feature === "background")).toBe(true);
    });
  });

  describe("overrides", () => {
    it("override takes precedence over portable mapping", () => {
      const result = renderToml({
        ...baseInput,
        toolAccess: "readonly",
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
  });
});
