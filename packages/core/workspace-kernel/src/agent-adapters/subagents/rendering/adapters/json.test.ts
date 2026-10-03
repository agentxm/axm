import { describe, expect, it } from "vitest";
import { renderJson } from "./json.js";
import type { SubagentRenderInput } from "../types.js";

const baseInput: SubagentRenderInput = {
  agentId: "kiro",
  name: "code-reviewer",
  body: "You are a code reviewer.",
  frontmatter: {
    name: "code-reviewer",
    description: "Reviews code changes",
  },
};

describe("renderJson", () => {
  it("renders to .kiro/agents path with .json extension", () => {
    const result = renderJson(baseInput);
    expect(result._tag).toBe("Rendered");
    if (result._tag !== "Rendered") return;
    expect(result.outputs[0]?.path).toBe("code-reviewer.json");
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

  it("includes name and description from frontmatter", () => {
    const result = renderJson(baseInput);
    if (result._tag !== "Rendered") return;
    const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
    expect(parsed.name).toBe("code-reviewer");
    expect(parsed.description).toBe("Reviews code changes");
  });

  it("passes arbitrary frontmatter keys through", () => {
    const result = renderJson({
      ...baseInput,
      frontmatter: {
        name: "code-reviewer",
        tools: ["read", "web"],
        nested: { a: 1 },
      },
    });
    if (result._tag !== "Rendered") return;
    const parsed = JSON.parse(result.outputs[0]?.content ?? "{}");
    expect(parsed.tools).toEqual(["read", "web"]);
    expect(parsed.nested).toEqual({ a: 1 });
  });

  it("produces valid JSON", () => {
    const result = renderJson(baseInput);
    if (result._tag !== "Rendered") return;
    expect(() => JSON.parse(result.outputs[0]?.content ?? "")).not.toThrow();
  });
});
