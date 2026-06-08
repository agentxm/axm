import type { Agent } from "../../schema.js";
export const ibmBobAgent = {
  id: "ibm-bob",
  name: "IBM Bob",
  vendor: "IBM",
  homepage: "https://bob.ibm.com",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".bob",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "IBM Bob documentation",
      url: "https://bob.ibm.com/docs/ide",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".bob/skills",
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
        notes:
          "Project servers live in .bob/mcp.json; user servers in ~/.bob/mcp_settings.json. Both files key entries under mcpServers. Remote entries carry a url field with no type discriminator; SSE is documented as legacy alongside streamable HTTP.\n",
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob"],
        scopes: ["user", "project"],
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
        lastVerified: "2026-06-06",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: false,
            targets: [
              {
                scope: "user",
                path: "~/.bob/mcp_settings.json",
                format: "json",
              },
              {
                scope: "project",
                path: ".bob/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: null,
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Bob custom modes are YAML entries (slug, name, roleDefinition, groups, customInstructions) in .bob/custom_modes.yaml (project) or the global custom_modes.yaml (user). Subagent-style extensions have no industry spec yet.\n",
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/configuration/custom-modes"],
        scopes: ["user", "project"],
        directory: ".bob/custom_modes.yaml",
        layout: "file",
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
        notes: "Bob automatically loads AGENTS.md from the workspace root.\n",
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/configuration/rules"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".bob/rules",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: false,
        importSyntax: null,
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
        "IBM Bob custom modes define tool access groups and file permissions, including read, edit, command, and mcp groups. AXM has not implemented a custom_modes permission writer.",
      docs: [],
      sources: [
        "https://bob.ibm.com/docs/ide/features/modes",
        "https://bob.ibm.com/docs/ide/configuration/custom-modes",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented an IBM Bob custom-modes permission writer.",
    },
  },
} as const satisfies Agent;
