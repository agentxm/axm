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
    expect(agentSupportsType(agentById("codex"), "skill")).toBe(false);
    expect(agentSupportsType(agentById("windsurf"), "command")).toBe(false);
  });

  it("finds agents that work with one extension type", () => {
    expect(worksOn("rule", AGENTS).map((agent) => agent.id)).toEqual(["cursor", "windsurf"]);
  });

  it("requires every requested type for multi-type compatibility", () => {
    expect(worksOnAll(["skill", "file"], AGENTS).map((agent) => agent.id)).toEqual([
      "claude-code",
      "gemini-cli",
    ]);
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
      { type: "mcp-server", support: "standard" },
      { type: "file", support: "standard" },
    ]);
  });
});
