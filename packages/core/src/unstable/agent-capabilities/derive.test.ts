import { describe, expect, it } from "vitest";
import {
  AGENTS,
  agentById,
  agentSupportsType,
  deriveAgentDescriptor,
  listCapabilities,
  supportedTypes,
  worksOn,
  worksOnAll,
  worksOnExtension,
} from "./index.js";
import type { Agent } from "./schema.js";

const baseAgent = {
  id: "codex",
  name: "Sample Agent",
  vendor: "Example",
  homepage: "https://example.com",
  interfaces: ["cli"],
  skills: {
    support: "standard",
    scopes: ["project"],
    directory: ".sample/skills",
  },
} satisfies Agent;

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
    expect(worksOn("rule", AGENTS).map((agent) => agent.id)).toEqual([
      "antigravity",
      "cline",
      "continue",
      "cursor",
      "ibm-bob",
      "junie",
      "kiro-cli",
      "roo",
      "trae-cn",
      "trae",
      "windsurf",
      "zencoder",
    ]);
  });

  it("requires every requested type for multi-type compatibility", () => {
    expect(worksOnAll(["rule", "subagent"], AGENTS).map((agent) => agent.id)).toEqual([
      "cursor",
      "ibm-bob",
      "junie",
      "kiro-cli",
      "roo",
      "zencoder",
    ]);
  });

  it("derives pack compatibility from all member types", () => {
    expect(
      worksOnExtension({ type: "pack", memberTypes: ["mcp-server", "file"] }, AGENTS).map(
        (agent) => agent.id,
      ),
    ).toEqual([
      "antigravity",
      "claude-code",
      "codex",
      "crush",
      "cursor",
      "gemini-cli",
      "github-copilot",
      "grok-cli",
      "hermes",
      "ibm-bob",
      "iflow-cli",
      "kilo",
      "kiro-cli",
      "mistral-vibe",
      "openhands",
      "qoder",
      "windsurf",
    ]);
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

  it("derives descriptors with explicit rootDir and own-file instructions", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        rootDir: ".sample-root",
        commands: {
          support: "bridged",
          scopes: ["project"],
          directory: ".sample/commands",
        },
        subagents: {
          support: "bridged",
          scopes: ["project"],
          directory: ".sample/agents",
          layout: "directory",
        },
        instructions: {
          support: "bridged",
          scopes: ["project"],
          kind: "own-file",
          files: ["SAMPLE.md"],
          nestedDiscovery: true,
          importSyntax: "at-path",
        },
      }),
    ).toEqual({
      id: "codex",
      name: "Sample Agent",
      rootDir: ".sample-root",
      skills: { dir: ".sample/skills" },
      commands: { dir: ".sample/commands" },
      subagents: { dir: ".sample/agents" },
      instructions: { kind: "own-file", file: "SAMPLE.md", importSyntax: "at-path" },
    });
  });

  it("derives explicit rootDir opt-out and file-style subagents", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        rootDir: null,
        subagents: {
          support: "bridged",
          scopes: ["project"],
          directory: ".sample-modes.yaml",
          layout: "file",
        },
      }),
    ).toEqual({
      id: "codex",
      name: "Sample Agent",
      rootDir: undefined,
      skills: { dir: ".sample/skills" },
      subagents: { dir: ".sample-modes.yaml", isFile: true },
    });
  });

  it("derives omitted rootDir from the skills directory first segment", () => {
    expect(deriveAgentDescriptor(baseAgent).rootDir).toBe(".sample");
  });

  it("derives explicit detection markers", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        detection: {
          projectDirs: [".sample"],
          userDirs: ["~/.sample"],
        },
      }).detection,
    ).toEqual({
      projectDirs: [".sample"],
      userDirs: ["~/.sample"],
    });
  });

  it("derives agents-md and rules-dir instruction descriptors", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        instructions: {
          support: "standard",
          scopes: ["project"],
          kind: "agents-md",
          files: ["AGENTS.md"],
          nestedDiscovery: true,
        },
      }).instructions,
    ).toEqual({ kind: "agents-md" });

    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        instructions: {
          support: "bridged",
          scopes: ["project"],
          kind: "rules-dir",
          files: ["RULES.md"],
          nestedDiscovery: false,
        },
        rules: {
          support: "bridged",
          scopes: ["project"],
          directory: ".sample/rules",
        },
      }).instructions,
    ).toEqual({ kind: "rules-dir", dir: ".sample/rules", format: "frontmatter" });
  });
});
