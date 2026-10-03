import { describe, expect, it } from "vitest";
import { renderSubagent, selectSubagentRenderer } from "./index.js";
import type { SubagentRenderInput } from "./types.js";

const baseInput: SubagentRenderInput = {
  agentId: "claude-code",
  name: "code-reviewer",
  body: "You are a code reviewer.",
  frontmatter: {
    name: "code-reviewer",
    description: "Reviews code changes",
  },
};

describe("selectSubagentRenderer", () => {
  it("returns renderer for Claude Code", () => {
    expect(selectSubagentRenderer("claude-code")).toBeDefined();
  });

  it("returns renderer for Codex", () => {
    expect(selectSubagentRenderer("codex")).toBeDefined();
  });

  it("returns undefined for Roo Code", () => {
    expect(selectSubagentRenderer("roo")).toBeUndefined();
  });

  it("does not invent a renderer for unknown agents", () => {
    expect(selectSubagentRenderer("unknown-agent")).toBeUndefined();
  });
});

describe("renderSubagent", () => {
  it("returns undefined for roo", () => {
    const result = renderSubagent({ ...baseInput, agentId: "roo" });
    expect(result).toBeUndefined();
  });

  it("renders for Claude Code", () => {
    const result = renderSubagent(baseInput);
    expect(result).toBeDefined();
    expect(result?._tag).toBe("Rendered");
    if (result?._tag !== "Rendered") return;
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.path).toBe("code-reviewer.md");
  });

  it("renders for Codex", () => {
    const result = renderSubagent({ ...baseInput, agentId: "codex" });
    expect(result?._tag).toBe("Rendered");
    if (result?._tag !== "Rendered") return;
    expect(result.outputs[0]?.path).toBe("code-reviewer.toml");
  });
});
