import type { Agent } from "../../schema.js";
export const clineAgent = {
  id: "cline",
  name: "Cline",
  vendor: "Cline",
  homepage: "https://cline.bot",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".cline",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Cline documentation",
      url: "https://docs.cline.bot",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.cline.bot/customization/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".cline/skills",
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
        notes:
          "Cline Workflows are user-authored Markdown files invoked as slash commands (/name.md), stored in .clinerules/workflows (project) and ~/Documents/Cline/Workflows (user).",
        docs: [],
        sources: ["https://docs.cline.bot/features/commands-and-shortcuts/overview"],
        scopes: ["user", "project"],
        directory: ".clinerules/workflows",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Cline supports MCP in both the extension and CLI. The CLI MCP config is ~/.cline/mcp.json; extension config is exposed through the MCP settings UI. Entries use the community-standard mcpServers shape with a streamableHttp remote discriminator plus Cline-specific disabled and autoApprove fields.",
        docs: [],
        sources: ["https://docs.cline.bot/mcp/configuring-mcp-servers"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-24",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: true,
            targets: [
              {
                scope: "user",
                path: "~/.cline/mcp.json",
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
                  "streamable-http": "streamableHttp",
                  sse: "sse",
                },
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: "headers",
            },
            transform: null,
          },
        },
      },
    },
    subagent: {
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
        sources: ["https://docs.cline.bot/customization/cline-rules"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        kind: "rules-dir",
        files: ["*.md", "*.txt"],
        nestedDiscovery: false,
        importSyntax: null,
        directory: ".clinerules",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Cline stores executable hooks under ~/Documents/Cline/Hooks and .clinerules/hooks. The native script-directory shape is not compatible with AXM's grouped JSON command-hook writer.",
        docs: [],
        sources: ["https://docs.cline.bot/customization/hooks"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason: "AXM has not implemented a Cline hook script directory writer.",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Cline exposes auto-approve controls in the extension/CLI UI and toolPolicies in the SDK. The public docs do not define a stable AXM-writable project permission grant file.",
      docs: [],
      sources: [
        "https://docs.cline.bot/cline-cli/interactive-mode",
        "https://docs.cline.bot/sdk/guides/permission-handling",
      ],
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
      reason: "AXM has not implemented a Cline permission grant writer.",
    },
  },
} as const satisfies Agent;
