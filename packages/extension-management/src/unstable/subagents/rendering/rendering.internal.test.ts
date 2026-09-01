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
  agentOverrides: undefined,
};

describe("selectSubagentRenderer", () => {
  it("returns renderer for Claude Code", () => {
    expect(selectSubagentRenderer("claude-code")).toBeDefined();
  });

  it("returns renderer for Codex", () => {
    expect(selectSubagentRenderer("codex")).toBeDefined();
  });

  it("returns renderer for Kiro (dual-format)", () => {
    expect(selectSubagentRenderer("kiro")).toBeDefined();
  });

  it("returns undefined for Roo Code", () => {
    expect(selectSubagentRenderer("roo")).toBeUndefined();
  });

  it("returns default renderer for unknown agents", () => {
    expect(selectSubagentRenderer("unknown-agent")).toBeDefined();
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
    expect(result.outputs[0]?.path).toBe(".claude/agents/code-reviewer.md");
  });

  it("renders for Codex", () => {
    const result = renderSubagent({ ...baseInput, agentId: "codex" });
    expect(result?._tag).toBe("Rendered");
    if (result?._tag !== "Rendered") return;
    expect(result.outputs[0]?.path).toBe(".codex/agents/code-reviewer.toml");
  });
});

describe("Kiro dual-format rendering", () => {
  it("produces two files — .md for IDE and .json for CLI", () => {
    const result = renderSubagent({ ...baseInput, agentId: "kiro" });
    expect(result?._tag).toBe("Rendered");
    if (result?._tag !== "Rendered") return;
    expect(result.outputs).toHaveLength(2);

    const paths = result.outputs.map((o) => o.path);
    expect(paths).toContain(".kiro/agents/code-reviewer.md");
    expect(paths).toContain(".kiro/agents/code-reviewer.json");
  });

  it("MD file starts with frontmatter", () => {
    const result = renderSubagent({ ...baseInput, agentId: "kiro" });
    if (result?._tag !== "Rendered") return;
    const mdOutput = result.outputs.find((o) => o.path.endsWith(".md"));
    expect(mdOutput?.content.startsWith("---\n")).toBe(true);
  });

  it("JSON file has no _axm_managed field", () => {
    const result = renderSubagent({ ...baseInput, agentId: "kiro" });
    if (result?._tag !== "Rendered") return;
    const jsonOutput = result.outputs.find((o) => o.path.endsWith(".json"));
    const parsed = JSON.parse(jsonOutput?.content ?? "{}");
    expect(parsed._axm_managed).toBeUndefined();
  });
});

describe("source hash computation (reuse from rendered-files)", () => {
  it("is available via the shared utility", async () => {
    const { computeSourceHash } = await import("../../workspace/rendered-files.js");
    const hash1 = computeSourceHash("content A");
    const hash2 = computeSourceHash("content A");
    const hash3 = computeSourceHash("content B");
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });
});
