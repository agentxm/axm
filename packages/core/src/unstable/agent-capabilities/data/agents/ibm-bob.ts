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
        support: "supported",
        lastVerified: "2026-05-20",
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
        support: "unsupported",
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
        support: "supported",
        lastVerified: "2026-05-19",
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
        support: "supported",
        lastVerified: "2026-05-19",
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
        support: "unsupported",
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
        support: "supported",
        lastVerified: "2026-05-19",
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
        writer: null,
        verified: null,
      },
    },
  },
  permissions: {
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
  },
} as const satisfies Agent;
