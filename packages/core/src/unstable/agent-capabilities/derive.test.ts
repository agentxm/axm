import { describe, expect, it } from "vitest";
import {
  AGENTS,
  agentById,
  agentCapabilityStatus,
  agentSupportsType,
  axmIntegrationStatus,
  deriveAgentDescriptor,
  deriveHookPortability,
  getSupportedAgentsForExtension,
  getSupportedAgentsForExtensionType,
  getSupportedAgentsForExtensionTypes,
  getSupportedExtensionTypesForAgent,
  listCapabilities,
  toNativeAgent,
} from "./index.js";
import type { Agent } from "./schema.js";
const unsupportedCapability = {
  native: {
    availability: { via: "none" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: [],
  },
  axm: {
    support: "unsupported",
    writer: null,
  },
} as const;
const unsupportedHookCapability = {
  ...unsupportedCapability,
  canonical: {
    events: [],
    mechanism: [],
    matcherKinds: [],
    decision: [],
  },
} as const;
const baseAgent = {
  id: "codex",
  name: "Sample Agent",
  vendor: "Example",
  homepage: "https://example.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".sample",
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [],
  capabilities: {
    skill: {
      native: {
        standardsCompliance: "full",
        convention: "vendor",
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://example.com/skills"],
        scopes: ["project"],
        directory: ".sample/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    command: unsupportedCapability,
    "mcp-server": unsupportedCapability,
    subagent: unsupportedCapability,
    files: unsupportedCapability,
    rule: unsupportedCapability,
    hook: unsupportedHookCapability,
  },
  permissions: unsupportedCapability,
} satisfies Agent;
const sampleRootDetection = {
  project: {
    markers: [{ kind: "dir", path: ".sample", signal: "definitive", note: null }],
  },
  user: { markers: [] },
};
const supportedSkillWithNoStandardsCompliance = {
  ...baseAgent.capabilities.skill,
  native: {
    ...baseAgent.capabilities.skill.native,
    standardsCompliance: "none",
  },
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
  it("determines support from AXM support and availability", () => {
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
    expect(
      agentSupportsType(
        {
          ...baseAgent,
          capabilities: {
            ...baseAgent.capabilities,
            skill: {
              ...baseAgent.capabilities.skill,
              native: {
                ...baseAgent.capabilities.skill.native,
                availability: { via: "none" },
              },
            },
          },
        },
        "skill",
      ),
    ).toBe(false);
  });
  it("does not infer support for omitted capabilities", () => {
    expect(agentSupportsType(agentById("codex"), "files")).toBe(false);
    expect(agentSupportsType(agentById("github-copilot-cli"), "files")).toBe(false);
  });
  it("requires supported MCP capabilities without writer config to explain why they are not writable", () => {
    const unsupportedWritableMcp = AGENTS.flatMap((agent) => {
      const capability = agent.capabilities["mcp-server"];
      if (capability.axm.support !== "supported") return [];
      if (capability.axm.writer !== null) return [];
      if (capability.native.notes !== null) return [];
      return [agent.id];
    });
    expect(unsupportedWritableMcp).toEqual([]);
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
      "github-copilot-cli",
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
      "github-copilot-cli",
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
      "github-copilot-cli",
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
        agentStatus: agentCapabilityStatus(entry.capability),
        axmStatus: axmIntegrationStatus(entry.capability),
        ...("standardsCompliance" in entry.capability.native
          ? { standardsCompliance: entry.capability.native.standardsCompliance }
          : {}),
      })),
    ).toEqual([
      {
        type: "skill",
        agentStatus: "native",
        axmStatus: "supported",
        standardsCompliance: "full",
      },
      {
        type: "command",
        agentStatus: "native-deprecated",
        axmStatus: "supported",
      },
      {
        type: "mcp-server",
        agentStatus: "native",
        axmStatus: "supported",
        standardsCompliance: "full",
      },
      {
        type: "subagent",
        agentStatus: "native",
        axmStatus: "supported",
      },
      {
        type: "rule",
        agentStatus: "native",
        axmStatus: "supported",
        standardsCompliance: "full",
      },
      {
        type: "hook",
        agentStatus: "native",
        axmStatus: "unsupported",
      },
    ]);
  });
  it("derives capability headline statuses", () => {
    const native = baseAgent.capabilities.skill;
    const nativeDeprecated = {
      ...native,
      native: {
        ...native.native,
        vendorStatus: {
          state: "deprecated",
          since: null,
          note: "Use skills instead.",
          supersededByType: "skill",
        },
      },
    } satisfies Agent["capabilities"]["skill"];
    const plugin = {
      native: {
        availability: {
          via: "plugin",
          provider: "third-party",
          plugin: {
            name: "sample-plugin",
            homepage: "https://example.com/plugin",
            author: null,
            distribution: {
              mechanism: "manual",
              installHint: null,
              packageRef: null,
            },
            detection: null,
          },
        },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
        scopes: ["project"],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    } satisfies Agent["capabilities"]["subagent"];
    const pluginDeprecated = {
      ...plugin,
      native: {
        ...plugin.native,
        vendorStatus: {
          state: "removed",
          since: null,
          note: "Plugin archived.",
          supersededByType: null,
        },
      },
    } satisfies Agent["capabilities"]["subagent"];
    expect([
      agentCapabilityStatus(native),
      agentCapabilityStatus(nativeDeprecated),
      agentCapabilityStatus(plugin),
      agentCapabilityStatus(pluginDeprecated),
      axmIntegrationStatus({
        ...native,
        axm: {
          support: "planned",
          lastVerified: "2026-05-16",
          writer: null,
        },
      }),
      agentCapabilityStatus(unsupportedCapability),
      axmIntegrationStatus({
        ...unsupportedCapability,
        axm: {
          support: "unknown",
          writer: null,
        },
      }),
    ]).toEqual([
      "native",
      "native-deprecated",
      "plugin",
      "plugin-deprecated",
      "planned",
      "none",
      "unknown",
    ]);
  });
  it("captures the Codex and Pi worked examples", () => {
    const codexCommand = agentById("codex").capabilities.command;
    const piSubagents = agentById("pi").capabilities.subagent;
    expect(agentCapabilityStatus(codexCommand)).toBe("native-deprecated");
    expect(axmIntegrationStatus(codexCommand)).toBe("supported");
    expect(codexCommand.native.vendorStatus).toMatchObject({
      state: "deprecated",
      supersededByType: "skill",
    });
    expect(agentCapabilityStatus(piSubagents)).toBe("plugin");
    expect(axmIntegrationStatus(piSubagents)).toBe("unsupported");
    expect(piSubagents.native.availability).toMatchObject({
      via: "plugin",
      provider: "third-party",
      plugin: {
        name: "pi-subagents",
        distribution: { installHint: "pi install npm:pi-subagents" },
      },
    });
    expect(agentSupportsType(agentById("pi"), "subagent")).toBe(false);
  });
  it("projects a native agent without AXM internals", () => {
    const native = toNativeAgent(agentById("codex"));
    const serialized = JSON.stringify(native);
    expect(serialized).not.toContain('"axm"');
    expect(serialized).not.toContain('"support"');
    expect(serialized).not.toContain('"writer"');
    expect(native.capabilities.skill).toMatchObject({
      availability: { via: "native" },
      directory: ".codex/skills",
    });
  });
  it("derives hook portability verdicts from canonical event and AXM support", () => {
    const requirement = {
      events: ["tool.pre"],
      mechanisms: ["command-stdin"],
      decisions: ["block"],
    } as const;
    expect(deriveHookPortability(agentById("claude-code"), requirement)).toMatchObject({
      standardsCompliance: "full",
    });
    expect(deriveHookPortability(agentById("amp"), requirement)).toMatchObject({
      standardsCompliance: "partial",
    });
    expect(deriveHookPortability(agentById("warp"), requirement)).toMatchObject({
      standardsCompliance: "none",
    });
  });
  it("derives descriptors with explicit rootDir and own-file instructions", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        rootDir: ".sample-root",
        capabilities: {
          ...baseAgent.capabilities,
          command: {
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/commands"],
              scopes: ["project"],
              directory: ".sample/commands",
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
          subagent: {
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/subagents"],
              scopes: ["project"],
              directory: ".sample/agents",
              layout: "directory",
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
          rule: {
            native: {
              standardsCompliance: "parity",
              convention: "vendor",
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/instructions"],
              scopes: ["project"],
              kind: "own-file",
              files: ["SAMPLE.md"],
              nestedDiscovery: true,
              importSyntax: "at-path",
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
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
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/subagents"],
              scopes: ["project"],
              directory: ".sample-modes.yaml",
              layout: "file",
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
        },
      }),
    ).toEqual({
      id: "codex",
      name: "Sample Agent",
      rootDir: undefined,
      skills: { dir: ".sample/skills" },
      detection: { project: { markers: [] }, user: { markers: [] } },
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
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/mcp"],
              scopes: ["project"],
              standardsCompliance: "full",
              convention: "vendor",
              transports: ["stdio"],
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: {
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
            native: {
              standardsCompliance: "full",
              convention: "universal",
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/instructions"],
              scopes: ["project"],
              kind: "agents-md",
              files: ["AGENTS.md"],
              nestedDiscovery: true,
              importSyntax: null,
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
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
            native: {
              standardsCompliance: "partial",
              convention: "vendor",
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/instructions"],
              scopes: ["project"],
              kind: "rules-dir",
              files: ["RULES.md"],
              nestedDiscovery: false,
              importSyntax: null,
              directory: ".sample/rules",
            },
            axm: {
              support: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
        },
      }).instructions,
    ).toEqual({ kind: "rules-dir", dir: ".sample/rules", format: "frontmatter" });
  });
});
