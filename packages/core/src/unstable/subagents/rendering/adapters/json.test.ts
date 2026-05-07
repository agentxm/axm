import { describe, expect, it } from "vitest";
import { renderJson } from "./json.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "kiro",
  name: "code-reviewer",
  description: "Reviews code changes",
  model: undefined,
  toolAccess: undefined,
  background: undefined,
  body: "You are a code reviewer.",
  agentOverrides: undefined,
};

describe("renderJson", () => {
  it("renders to .kiro/agents path with .json extension", () => {
    const result = renderJson(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.path).toBe(".kiro/agents/code-reviewer.json");
  });

  it("does not include an AXM marker field", () => {
    const result = renderJson(baseInput);
    if (result._tag !== "Rendered") return;
    const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
    expect(parsed._axm_managed).toBeUndefined();
  });

  it("maps body to prompt field", () => {
    const result = renderJson(baseInput);
    if (result._tag !== "Rendered") return;
    const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
    expect(parsed.prompt).toBe("You are a code reviewer.");
  });

  it("includes name and description", () => {
    const result = renderJson(baseInput);
    if (result._tag !== "Rendered") return;
    const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
    expect(parsed.name).toBe("code-reviewer");
    expect(parsed.description).toBe("Reviews code changes");
  });

  describe("tool access", () => {
    it("omits tools for full access", () => {
      const result = renderJson({ ...baseInput, toolAccess: "full" });
      if (result._tag !== "Rendered") return;
      const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
      expect(parsed.tools).toBeUndefined();
    });

    it("sets tools for readonly", () => {
      const result = renderJson({ ...baseInput, toolAccess: "readonly" });
      if (result._tag !== "Rendered") return;
      const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
      expect(parsed.tools).toEqual(["read", "web"]);
    });

    it("sets empty tools for none", () => {
      const result = renderJson({ ...baseInput, toolAccess: "none" });
      if (result._tag !== "Rendered") return;
      const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
      expect(parsed.tools).toEqual([]);
    });
  });

  describe("background", () => {
    it("warns when background is true", () => {
      const result = renderJson({ ...baseInput, background: true });
      if (result._tag !== "Rendered") return;
      expect(result.warnings.some((w) => w.feature === "background")).toBe(true);
    });
  });

  describe("overrides", () => {
    it("merges overrides on top", () => {
      const result = renderJson({
        ...baseInput,
        agentOverrides: { keyboardShortcut: "ctrl+r" },
      });
      if (result._tag !== "Rendered") return;
      const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
      expect(parsed.keyboardShortcut).toBe("ctrl+r");
    });

    it("null override removes a portable-mapped field", () => {
      const result = renderJson({
        ...baseInput,
        toolAccess: "readonly",
        agentOverrides: { tools: null },
      });
      if (result._tag !== "Rendered") return;
      const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
      expect(parsed.tools).toBeUndefined();
    });
  });

  it("produces valid JSON", () => {
    const result = renderJson(baseInput);
    if (result._tag !== "Rendered") return;
    expect(() => JSON.parse(result.outputs[0]?.content ?? "")).not.toThrow();
  });
});
