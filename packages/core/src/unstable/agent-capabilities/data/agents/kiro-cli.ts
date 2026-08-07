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
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kiro.dev/docs/mcp/configuration/"],
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
        lastVerified: "2026-08-05",
        writer: {
          config: {
            serversKey: "mcpServers",
            activationField: {
              required: { name: "disabled", enabled: false, disabled: true },
              accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
            },
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
              typeField: { required: null, accepted: [null] },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: { required: null, accepted: [null] },
              urlKey: {
                "streamable-http": "url",
              },
              headersKey: "headers",
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
        lastVerified: "2026-08-05",
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
        lastVerified: null,
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
      lastVerified: "2026-08-05",
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
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Kiro CLI custom-agent permission grant writer.",
    },
  },
} as const satisfies Agent;
