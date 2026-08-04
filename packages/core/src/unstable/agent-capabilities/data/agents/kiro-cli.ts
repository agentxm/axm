import type { Agent } from "../../schema.js";
export const kiroCliAgent = {
  id: "kiro-cli",
  name: "Kiro CLI",
  vendor: "AWS",
  homepage: "https://kiro.dev",
  interfaces: ["cli"],
  family: "amazon",
  rootDir: ".kiro",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kiro CLI documentation",
      url: "https://kiro.dev/docs/cli/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kiro.dev/docs/cli/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".kiro/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://kiro.dev/docs/cli/reference/slash-commands/"],
        scopes: ["user", "project"],
        directory: ".kiro/prompts",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kiro.dev/docs/cli/mcp/", "https://kiro.dev/docs/cli/mcp/configuration/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "braced",
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
                scope: "project",
                path: ".kiro/settings/mcp.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.kiro/settings/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                name: "type",
                value: {
                  "streamable-http": "http",
                  sse: "http",
                },
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: null,
            },
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
        sources: ["https://kiro.dev/docs/cli/custom-agents/configuration-reference/"],
        scopes: ["user", "project"],
        directory: ".kiro/agents",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Kiro CLI hooks are command hooks in agent configuration. AXM models the surface but does not serialize Kiro CLI hooks yet.",
        docs: [],
        sources: [
          "https://kiro.dev/docs/cli/hooks/",
          "https://kiro.dev/docs/cli/custom-agents/configuration-reference/",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason: "AXM has not implemented a Kiro CLI hooks writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Kiro CLI steering files live under .kiro/steering and can be always-on, conditional, or manually referenced.",
      docs: [],
      sources: ["https://kiro.dev/docs/cli/steering/"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      directory: ".kiro/steering",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: true,
      importSyntax: null,
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
        "Kiro CLI custom agent configuration supports allowedTools, toolsSettings, and the hooks/MCP tools settings surfaces. The public docs do not define a single default AXM-writable permission grant target.",
      docs: [],
      sources: [
        "https://kiro.dev/docs/cli/custom-agents/configuration-reference/",
        "https://kiro.dev/docs/cli/",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "project",
          path: ".kiro/agents/*.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.kiro/agents/*.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: 'allowedTools: ["Read", "Write", "Bash"]',
        notes: "Permission rules are embedded in custom agent configuration files.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented a Kiro CLI custom-agent permission grant writer.",
    },
  },
} as const satisfies Agent;
