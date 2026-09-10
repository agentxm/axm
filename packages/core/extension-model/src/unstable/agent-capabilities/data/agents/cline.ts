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
        additionalReadPaths: [
          { path: ".clinerules/skills", status: "compat" },
          { path: ".claude/skills", status: "compat" },
        ],
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
        notes:
          "Cline supports MCP in both the extension and CLI. The CLI MCP config is ~/.cline/mcp.json; extension config is exposed through the MCP settings UI. Entries use the community-standard mcpServers shape with a streamableHttp remote discriminator plus Cline-specific disabled and autoApprove fields.",
        docs: [],
        sources: ["https://docs.cline.bot/mcp/mcp-overview"],
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
                scope: "user",
                path: "~/.cline/mcp.json",
                format: "json",
                attribution: "agent",
              },
            ],
            stdio: {
              typeField: { required: null, accepted: [null] },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                required: {
                  name: "type",
                  value: {
                    "streamable-http": "streamableHttp",
                    sse: "sse",
                  },
                },
                accepted: [
                  {
                    name: "type",
                    value: {
                      "streamable-http": "streamableHttp",
                      sse: "sse",
                    },
                  },
                ],
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: "headers",
            },
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
        lastVerified: null,
        reason: "AXM has not implemented a Cline hook script directory writer.",
      },
    },
  },
  instructions: {
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
      lastVerified: "2026-08-05",
      writer: null,
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
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Cline permission grant writer.",
    },
  },
} as const satisfies Agent;
