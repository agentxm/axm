import type { Agent } from "../../schema.js";
export const zencoderAgent = {
  id: "zencoder",
  name: "Zencoder",
  vendor: "Zencoder",
  homepage: "https://zencoder.ai",
  interfaces: ["ide-extension"],
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
        notes: null,
        docs: [],
        sources: ["https://docs.zencoder.ai/features/agent-skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".zencoder/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
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
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.zencoder.ai/features/integrations-and-mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: true,
            targets: [
              {
                scope: "user",
                path: "~/.zencoder/mcp.json",
                format: "json",
              },
              {
                scope: "project",
                path: ".zencoder/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: null,
            transform: null,
          },
        },
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
    files: {
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
    },
    rule: {
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
