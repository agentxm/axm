import { describe, expect, it } from "vitest";
import {
  AGENTS,
  agentById,
  agentSupportsType,
  deriveAgentDescriptor,
  getSupportedAgentsForExtension,
  getSupportedAgentsForExtensionType,
  getSupportedAgentsForExtensionTypes,
  getSupportedExtensionTypesForAgent,
  listCapabilities,
} from "./index.js";
import type { Agent } from "./schema.js";

const baseAgent = {
  id: "codex",
  name: "Sample Agent",
  vendor: "Example",
  homepage: "https://example.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".sample",
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [],
  capabilities: {
    skill: {
      standardsCompliance: "full",
      convention: "vendor",
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://example.com/skills"],
      lastVerified: "2026-05-16",
      scopes: ["project"],
      directory: ".sample/skills",
    },
    command: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
    "mcp-server": { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
    subagent: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
    files: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
    rule: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
    hook: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  },
  permissions: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
} satisfies Agent;

const sampleRootDetection = {
  project: {
    markers: [{ kind: "dir", path: ".sample", signal: "definitive", note: null }],
  },
  user: { markers: [] },
};

const supportedSkillWithNoStandardsCompliance = {
  ...baseAgent.capabilities.skill,
  standardsCompliance: "none",
} satisfies Agent["capabilities"]["skill"];

describe("agent capability derivation", () => {
  it("lists supported leaf extension types for an agent", () => {
    expect(getSupportedExtensionTypesForAgent(agentById("claude-code"))).toEqual([
      "skill",
      "command",
      "mcp-server",
      "subagent",
      "rule",
      "hook",
    ]);
  });

  it("counts supported capabilities as support", () => {
    expect(agentSupportsType(agentById("claude-code"), "rule")).toBe(true);
    expect(agentSupportsType(agentById("claude-code"), "files")).toBe(false);
    expect(agentSupportsType(agentById("cursor"), "rule")).toBe(true);
  });

  it("determines support from lifecycle only", () => {
    expect(
      agentSupportsType(
        {
          ...baseAgent,
          capabilities: {
            ...baseAgent.capabilities,
            skill: supportedSkillWithNoStandardsCompliance,
          },
        },
        "skill",
      ),
    ).toBe(true);
  });

  it("does not infer support for omitted capabilities", () => {
    expect(agentSupportsType(agentById("codex"), "files")).toBe(false);
    expect(agentSupportsType(agentById("github-copilot"), "files")).toBe(false);
  });

  it("does not count explicit unsupported as support", () => {
    expect(agentSupportsType(agentById("windsurf"), "subagent")).toBe(false);
  });

  it("finds agents that support one extension type", () => {
    expect(getSupportedAgentsForExtensionType("rule", AGENTS).map((agent) => agent.id)).toEqual([
      "adal",
      "amp",
      "antigravity",
      "augment",
      "claude-code",
      "cline",
      "codex",
      "continue",
      "crush",
      "cursor",
      "devin",
      "droid",
      "forgecode",
      "gemini-cli",
      "github-copilot",
      "grok-cli",
      "hermes",
      "ibm-bob",
      "junie",
      "kilo",
      "kiro-cli",
      "kode",
      "mistral-vibe",
      "mux",
      "openhands",
      "pi",
      "qoder",
      "roo",
      "trae-cn",
      "trae",
      "windsurf",
      "zencoder",
    ]);
  });

  it("defaults single-type support lookup to the full catalog", () => {
    expect(getSupportedAgentsForExtensionType("skill").map((agent) => agent.id)).toContain("codex");
  });

  it("requires every requested type for multi-type compatibility", () => {
    expect(
      getSupportedAgentsForExtensionTypes(["rule", "subagent"], AGENTS).map((agent) => agent.id),
    ).toEqual([
      "amp",
      "augment",
      "claude-code",
      "codex",
      "cursor",
      "gemini-cli",
      "github-copilot",
      "ibm-bob",
      "junie",
      "kilo",
      "kiro-cli",
      "kode",
      "mistral-vibe",
      "mux",
      "qoder",
      "roo",
      "zencoder",
    ]);
  });

  it("derives pack compatibility from all member types", () => {
    expect(
      getSupportedAgentsForExtension(
        { type: "pack", memberTypes: ["mcp-server", "rule"] },
        AGENTS,
      ).map((agent) => agent.id),
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
      "junie",
      "kilo",
      "kiro-cli",
      "mistral-vibe",
      "openhands",
      "qoder",
      "roo",
      "trae-cn",
      "trae",
      "windsurf",
      "zencoder",
    ]);
  });

  it("does not treat empty packs as vacuously compatible", () => {
    expect(getSupportedAgentsForExtension({ type: "pack", memberTypes: [] }, AGENTS)).toEqual([]);
  });

  it("lists present capability details for support views", () => {
    expect(
      listCapabilities(agentById("codex")).map((entry) => ({
        type: entry.type,
        lifecycle: entry.capability.lifecycle,
        ...("standardsCompliance" in entry.capability
          ? { standardsCompliance: entry.capability.standardsCompliance }
          : {}),
      })),
    ).toEqual([
      { type: "skill", lifecycle: "supported", standardsCompliance: "full" },
      { type: "command", lifecycle: "supported" },
      { type: "mcp-server", lifecycle: "supported", standardsCompliance: "full" },
      { type: "subagent", lifecycle: "supported" },
      { type: "rule", lifecycle: "supported", standardsCompliance: "full" },
    ]);
  });

  it("derives descriptors with explicit rootDir and own-file instructions", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        rootDir: ".sample-root",
        capabilities: {
          ...baseAgent.capabilities,
          command: {
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/commands"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            directory: ".sample/commands",
          },
          subagent: {
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/subagents"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            directory: ".sample/agents",
            layout: "directory",
          },
          rule: {
            standardsCompliance: "parity",
            convention: "vendor",
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/instructions"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            kind: "own-file",
            files: ["SAMPLE.md"],
            nestedDiscovery: true,
            importSyntax: "at-path",
          },
        },
      }),
    ).toEqual({
      id: "codex",
      name: "Sample Agent",
      rootDir: ".sample-root",
      skills: { dir: ".sample/skills" },
      detection: {
        project: {
          markers: [{ kind: "dir", path: ".sample-root", signal: "definitive", note: null }],
        },
        user: { markers: [] },
      },
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
        capabilities: {
          ...baseAgent.capabilities,
          subagent: {
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/subagents"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            directory: ".sample-modes.yaml",
            layout: "file",
          },
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

  it("derives explicit rootDir", () => {
    expect(deriveAgentDescriptor(baseAgent).rootDir).toBe(".sample");
    expect(deriveAgentDescriptor(baseAgent).detection).toEqual(sampleRootDetection);
  });

  it("derives detection from rootDir, config files, and authored markers", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        detection: {
          project: {
            markers: [
              {
                kind: "file",
                path: ".sample/settings.json",
                signal: "ambiguous",
                note: "Shared settings format.",
              },
            ],
          },
          user: {
            markers: [{ kind: "dir", path: "~/.sample", signal: "definitive", note: null }],
          },
        },
        capabilities: {
          ...baseAgent.capabilities,
          "mcp-server": {
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/mcp"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            standardsCompliance: "full",
            convention: "vendor",
            transports: ["stdio"],
            config: {
              serversKey: "mcpServers",
              nativeEnabled: true,
              targets: [
                { scope: "project", path: ".sample/settings.json", format: "json" },
                { scope: "user", path: "~/.sample/settings.json", format: "json" },
              ],
              stdio: { typeField: null, command: "split", envKey: null },
              remote: null,
              transform: null,
            },
          },
        },
      }).detection,
    ).toEqual({
      project: {
        markers: [
          { kind: "dir", path: ".sample", signal: "definitive", note: null },
          {
            kind: "file",
            path: ".sample/settings.json",
            signal: "ambiguous",
            note: "Shared settings format.",
          },
        ],
      },
      user: {
        markers: [
          { kind: "file", path: "~/.sample/settings.json", signal: "supporting", note: null },
          { kind: "dir", path: "~/.sample", signal: "definitive", note: null },
        ],
      },
    });
  });

  it("derives agents-md and rules-dir instruction descriptors", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        capabilities: {
          ...baseAgent.capabilities,
          rule: {
            standardsCompliance: "full",
            convention: "universal",
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/instructions"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            kind: "agents-md",
            files: ["AGENTS.md"],
            nestedDiscovery: true,
            importSyntax: null,
          },
        },
      }).instructions,
    ).toEqual({ kind: "agents-md" });

    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        capabilities: {
          ...baseAgent.capabilities,
          rule: {
            standardsCompliance: "partial",
            convention: "vendor",
            lifecycle: "supported",
            notes: null,
            docs: [],
            sources: ["https://example.com/instructions"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            kind: "rules-dir",
            files: ["RULES.md"],
            nestedDiscovery: false,
            importSyntax: null,
            directory: ".sample/rules",
          },
        },
      }).instructions,
    ).toEqual({ kind: "rules-dir", dir: ".sample/rules", format: "frontmatter" });
  });
});
