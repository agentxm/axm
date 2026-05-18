import { describe, expect, it } from "vitest";
import {
  AGENTS,
  agentById,
  agentSupportsType,
  listCapabilities,
  supportedTypes,
  worksOn,
  worksOnAll,
  worksOnExtension,
} from "./index.js";

describe("agent capability derivation", () => {
  it("lists supported leaf extension types for an agent", () => {
    expect(supportedTypes(agentById("claude-code"))).toEqual([
      "skill",
      "command",
      "mcp-server",
      "subagent",
      "file",
    ]);
  });

  it("counts standard and bridged support as works-with support", () => {
    expect(agentSupportsType(agentById("claude-code"), "file")).toBe(true);
    expect(agentSupportsType(agentById("cursor"), "rule")).toBe(true);
  });

  it("does not infer support for omitted capabilities", () => {
    expect(agentSupportsType(agentById("codex"), "rule")).toBe(false);
    expect(agentSupportsType(agentById("github-copilot"), "rule")).toBe(false);
  });

  it("does not count explicit unsupported as works-with support", () => {
    expect(agentSupportsType(agentById("windsurf"), "subagent")).toBe(false);
  });

  it("finds agents that work with one extension type", () => {
    expect(worksOn("rule", AGENTS).map((agent) => agent.id)).toEqual(["cursor", "windsurf"]);
  });

  it("requires every requested type for multi-type compatibility", () => {
    expect(worksOnAll(["rule", "subagent"], AGENTS).map((agent) => agent.id)).toEqual(["cursor"]);
  });

  it("derives pack compatibility from all member types", () => {
    expect(
      worksOnExtension({ type: "pack", memberTypes: ["mcp-server", "file"] }, AGENTS).map(
        (agent) => agent.id,
      ),
    ).toEqual(["claude-code", "codex", "cursor", "gemini-cli", "github-copilot", "windsurf"]);
  });

  it("does not treat empty packs as vacuously compatible", () => {
    expect(worksOnExtension({ type: "pack", memberTypes: [] }, AGENTS)).toEqual([]);
  });

  it("lists present capability details for support views", () => {
    expect(
      listCapabilities(agentById("codex")).map((entry) => ({
        type: entry.type,
        support: entry.capability.support,
      })),
    ).toEqual([
      { type: "skill", support: "standard" },
      { type: "command", support: "bridged" },
      { type: "mcp-server", support: "standard" },
      { type: "subagent", support: "bridged" },
      { type: "file", support: "standard" },
    ]);
  });
});
