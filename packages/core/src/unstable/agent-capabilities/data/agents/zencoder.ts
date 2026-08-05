import type { Agent } from "../../schema.js";
export const zencoderAgent = {
  id: "zencoder",
  name: "Zencoder",
  vendor: "Zencoder",
  homepage: "https://zencoder.ai",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".zencoder",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Zencoder documentation",
      url: "https://docs.zencoder.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Zencoder uses the cross-agent .agents/skills location; the legacy .zencoder/skills path remains readable but is deprecated.",
        docs: [],
        sources: ["https://docs.zencoder.ai/features/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Zencoder configures VS Code MCP servers under the zencoder.mcpServers settings key; JetBrains exposes the same entries through Settings > Tools > Zencoder > MCP Servers.",
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://docs.zencoder.ai/zenflow/mcps",
          "https://docs.zencoder.ai/features/mcp-deep-dive",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM cannot yet model the dotted zencoder.mcpServers VS Code settings key, and the previous standalone .zencoder/mcp.json target was not vendor-documented.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.zencoder.ai/features/agents-overview"],
        scopes: ["user", "project"],
        directory: ".zencoder/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: [
        "https://docs.zencoder.ai/features/agents-overview",
        "https://docs.zencoder.ai/learn/10x-engineer/module-03",
      ],
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: false,
      importSyntax: null,
      directory: ".zencoder/rules",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Zencoder added MCP tool permission prompts in April 2026. The docs describe user-visible MCP permission control, not a stable AXM-writable permission file.",
      docs: [],
      sources: ["https://docs.zencoder.ai/changelog/april-2026"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented a Zencoder permission grant writer.",
    },
  },
} as const satisfies Agent;
