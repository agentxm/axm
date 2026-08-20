import { describe, expect, it } from "vitest";
import { PER_AGENT_EXTENSION_TYPES } from "../extensions/common.js";
import {
  AGENTS,
  agentById,
  agentCapabilityStatus,
  agentSupportsType,
  axmIntegrationStatus,
  canonicalCoverage,
  deriveAgentDescriptor,
  deriveSkillConvention,
  deriveHookPortability,
  getSupportedAgentsForExtension,
  getSupportedAgentsForExtensionType,
  getSupportedAgentsForExtensionTypes,
  getSupportedExtensionTypesForAgent,
  installable,
  isCapabilitySupported,
  listCapabilities,
  toNativeAgent,
} from "./index.js";
import type { AgentId } from "./index.js";
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
    status: "unsupported",
    lastVerified: null,
    writer: null,
  },
} as const;
const unsupportedHookCapability = {
  ...unsupportedCapability,
  axm: {
    status: "unsupported",
    writer: null,
    lastVerified: null,
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
        status: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    "mcp-server": unsupportedCapability,
    subagent: unsupportedCapability,
    hook: unsupportedHookCapability,
  },
  instructions: unsupportedCapability,
  permissions: unsupportedCapability,
} satisfies Agent;
const sampleRootDetection = {
  project: {
    markers: [{ kind: "dir", path: ".sample", signal: "definitive", note: null }],
  },
  user: { markers: [] },
};

describe("deriveSkillConvention", () => {
  it("derives universal only from the standard .agents Skill tree", () => {
    expect(deriveSkillConvention(".agents/skills")).toBe("universal");
    expect(deriveSkillConvention(".agents/skills/team")).toBe("universal");
    expect(deriveSkillConvention(".codex/skills")).toBe("vendor");
  });
});
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
      "mcp-server",
      "subagent",
      "rule",
      "hook",
    ]);
  });
  it("counts supported capabilities as support", () => {
    expect(agentSupportsType(agentById("claude-code"), "skill")).toBe(true);
    expect(isCapabilitySupported(agentById("claude-code").instructions)).toBe(true);
    expect(isCapabilitySupported(agentById("cursor").instructions)).toBe(true);
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
  it("does not infer support for capabilities an agent lacks natively", () => {
    const inferred = AGENTS.flatMap((agent) =>
      PER_AGENT_EXTENSION_TYPES.filter(
        (type) =>
          agent.capabilities[type].native.availability.via === "none" &&
          agentSupportsType(agent, type),
      ).map((type) => `${agent.id}:${type}`),
    );
    expect(inferred).toEqual([]);
  });
  it("requires supported MCP capabilities without writer config to explain why they are not writable", () => {
    const unsupportedWritableMcp = AGENTS.flatMap((agent) => {
      const capability = agent.capabilities["mcp-server"];
      if (capability.axm.status !== "supported") return [];
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
      "antigravity-cli",
      "augment",
      "claude-code",
      "cline",
      "codearts-agent",
      "codebuddy",
      "codex",
      "command-code",
      "continue",
      "crush",
      "cursor",
      "deepagents",
      "devin",
      "droid",
      "forgecode",
      "gemini-cli",
      "github-copilot-cli",
      "grok-cli",
      "hermes",
      "ibm-bob",
      "iflow-cli",
      "junie",
      "kilo",
      "kimi-cli",
      "kiro-cli",
      "kode",
      "mistral-vibe",
      "mux",
      "opencode",
      "openhands",
      "ona",
      "pi",
      "pochi",
      "qoder",
      "qoder-cn",
      "qwen-code",
      "roo",
      "trae-cn",
      "trae",
      "windsurf",
      "zencoder",
      "zed",
    ]);
  });
  it("defaults single-type support lookup to the full catalog", () => {
    expect(getSupportedAgentsForExtensionType("skill").map((agent) => agent.id)).toContain("codex");
  });
  it("requires every requested type for multi-type compatibility", () => {
    expect(
      getSupportedAgentsForExtensionTypes(["rule", "subagent"], AGENTS).map((agent) => agent.id),
    ).toEqual([
      "augment",
      "claude-code",
      "codearts-agent",
      "codebuddy",
      "codex",
      "command-code",
      "cursor",
      "deepagents",
      "devin",
      "gemini-cli",
      "github-copilot-cli",
      "grok-cli",
      "ibm-bob",
      "iflow-cli",
      "junie",
      "kilo",
      "kimi-cli",
      "kiro-cli",
      "kode",
      "mistral-vibe",
      "mux",
      "opencode",
      "qoder",
      "qoder-cn",
      "qwen-code",
      "roo",
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
      "augment",
      "claude-code",
      "cline",
      "codearts-agent",
      "codebuddy",
      "codex",
      "command-code",
      "crush",
      "cursor",
      "devin",
      "gemini-cli",
      "github-copilot-cli",
      "hermes",
      "ibm-bob",
      "junie",
      "kilo",
      "kimi-cli",
      "kiro-cli",
      "pochi",
      "qoder",
      "qwen-code",
      "trae-cn",
      "trae",
      "windsurf",
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
        type: "mcp-server",
        agentStatus: "native",
        axmStatus: "writer",
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
        axmStatus: "writer",
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
        status: "unsupported",
        lastVerified: null,
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
          status: "planned",
          lastVerified: "2026-05-16",
          writer: null,
        },
      }),
      agentCapabilityStatus(unsupportedCapability),
      axmIntegrationStatus({
        ...unsupportedCapability,
        axm: {
          status: "unknown",
          lastVerified: null,
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
  it("captures the Pi subagent worked example", () => {
    const piSubagents = agentById("pi").capabilities.subagent;
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
      directory: ".agents/skills",
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
      standardsCompliance: "none",
      reason: "Amp has no modeled native hook events.",
    });
    expect(deriveHookPortability(agentById("warp"), requirement)).toMatchObject({
      standardsCompliance: "none",
    });
  });
  it("derives canonical hook coverage from native events and tools", () => {
    expect(canonicalCoverage(agentById("claude-code"))).toMatchObject({
      events: [
        "tool.pre",
        "tool.post",
        "prompt.submit",
        "session.start",
        "turn.end",
        "subagent.stop",
        "compaction.pre",
      ],
      tools: ["file.read", "file.write", "file.edit", "shell.exec", "web.fetch"],
      mechanism: ["command-stdin"],
      matcherKinds: ["regex", "none-imperative"],
    });
  });
  it("treats decision subfields as advisory during hook installability checks", () => {
    expect(
      installable(agentById("claude-code"), {
        on: "turn.end",
        requires: { decision: { kind: "block", outcomes: ["ask"] } },
      }),
    ).toMatchObject({ installable: true });
  });
  it("derives descriptors with explicit rootDir and own-file instructions", () => {
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        rootDir: ".sample-root",
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
              directory: ".sample/agents",
              layout: "directory",
            },
            axm: {
              status: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
        },
        instructions: {
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
            status: "supported",
            lastVerified: "2026-05-16",
            writer: null,
          },
        },
      }),
    ).toEqual({
      id: "codex",
      name: "Sample Agent",
      rootDir: ".sample-root",
      skills: { dir: ".sample/skills", additionalReadPaths: [] },
      detection: {
        project: {
          markers: [{ kind: "dir", path: ".sample-root", signal: "definitive", note: null }],
        },
        user: { markers: [] },
      },
      subagents: { dir: ".sample/agents", scopes: ["project"] },
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
              status: "supported",
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
      skills: { dir: ".sample/skills", additionalReadPaths: [] },
      detection: { project: { markers: [] }, user: { markers: [] } },
      subagents: { dir: ".sample-modes.yaml", scopes: ["project"], isFile: true },
    });
  });
  it("derives explicit rootDir", () => {
    expect(deriveAgentDescriptor(baseAgent).rootDir).toBe(".sample");
    expect(deriveAgentDescriptor(baseAgent).detection).toEqual(sampleRootDetection);
  });
  it("isolates legacy skill scanners for agents without a verified skills surface", () => {
    const descriptor = deriveAgentDescriptor(agentById("codemaker"));

    expect(descriptor.rootDir).toBeUndefined();
    expect(descriptor.skills.dir).toBe(".codemaker/skills");
  });
  it("treats per-agent Markdown collections as directories, not opaque files", () => {
    for (const agentId of [
      "codearts-agent",
      "command-code",
      "deepagents",
      "grok-cli",
      "junie",
      "kimi-cli",
      "rovodev",
    ] as const) {
      expect(deriveAgentDescriptor(agentById(agentId)).subagents?.isFile).toBeUndefined();
    }

    for (const agentId of ["ibm-bob", "roo"] as const) {
      expect(deriveAgentDescriptor(agentById(agentId)).subagents?.isFile).toBe(true);
    }
  });
  it("does not treat a shared MCP target as agent-specific detection evidence", () => {
    const projectFileMarkers = (agentId: AgentId) =>
      deriveAgentDescriptor(agentById(agentId)).detection.project.markers.flatMap((marker) =>
        marker.kind === "file" ? [marker.path] : [],
      );

    for (const agentId of [
      "claude-code",
      "codebuddy",
      "command-code",
      "github-copilot-cli",
      "qoder",
    ] as const) {
      expect(projectFileMarkers(agentId)).not.toContain(".mcp.json");
    }
  });
  it("uses catalog attribution rather than reader count for MCP detection", () => {
    const cursor = agentById("cursor");
    const writer = cursor.capabilities["mcp-server"].axm.writer;
    if (writer === null) throw new Error("Cursor MCP writer fixture is required");
    const synthetic = {
      ...cursor,
      capabilities: {
        ...cursor.capabilities,
        "mcp-server": {
          ...cursor.capabilities["mcp-server"],
          axm: {
            ...cursor.capabilities["mcp-server"].axm,
            writer: {
              config: {
                ...writer.config,
                targets: writer.config.targets.map((target) => ({
                  ...target,
                  attribution: "shared" as const,
                })),
              },
            },
          },
        },
      },
    } satisfies Agent;

    const projectFiles = deriveAgentDescriptor(synthetic).detection.project.markers.flatMap(
      (marker) => (marker.kind === "file" ? [marker.path] : []),
    );
    expect(projectFiles).not.toContain(".cursor/mcp.json");
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
              status: "supported",
              lastVerified: "2026-05-16",
              writer: {
                config: {
                  serversKey: "mcpServers",
                  activationField: {
                    required: { name: "enabled", enabled: true, disabled: false },
                    accepted: [{ name: "enabled", enabled: true, disabled: false }],
                  },
                  targets: [
                    {
                      scope: "project",
                      path: ".sample/settings.json",
                      format: "json",
                      attribution: "agent",
                    },
                    {
                      scope: "user",
                      path: "~/.sample/settings.json",
                      format: "json",
                      attribution: "agent",
                    },
                  ],
                  stdio: {
                    typeField: { required: null, accepted: [null] },
                    command: "split",
                    envKey: null,
                  },
                  remote: null,
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
        },
        instructions: {
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
            status: "supported",
            lastVerified: "2026-05-16",
            writer: null,
          },
        },
      }).instructions,
    ).toEqual({ kind: "agents-md" });
    expect(
      deriveAgentDescriptor({
        ...baseAgent,
        capabilities: {
          ...baseAgent.capabilities,
        },
        instructions: {
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
            status: "supported",
            lastVerified: "2026-05-16",
            writer: null,
          },
        },
      }).instructions,
    ).toEqual({ kind: "rules-dir", dir: ".sample/rules", format: "frontmatter" });
  });
});
