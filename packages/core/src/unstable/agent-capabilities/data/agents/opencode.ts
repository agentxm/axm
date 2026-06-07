import type { Agent } from "../../schema.js";
export const opencodeAgent = {
  id: "opencode",
  name: "OpenCode",
  vendor: "SST",
  homepage: "https://opencode.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".opencode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "OpenCode documentation",
      url: "https://opencode.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://opencode.ai/docs"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".opencode/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://opencode.ai/docs"],
        scopes: ["user", "project"],
        directory: ".opencode/commands",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://opencode.ai/docs/mcp-servers/", "https://opencode.ai/docs/config/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        support: "supported",
        lastVerified: "2026-06-05",
        writer: {
          config: {
            serversKey: "mcp",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: "opencode.jsonc",
                format: "jsonc",
              },
              {
                scope: "user",
                path: "~/.config/opencode/opencode.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: {
                name: "type",
                value: "local",
              },
              command: "array",
              envKey: "environment",
            },
            remote: {
              typeField: {
                name: "type",
                value: {
                  "streamable-http": "remote",
                },
              },
              urlKey: {
                "streamable-http": "url",
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
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://opencode.ai/docs"],
        scopes: ["user", "project"],
        directory: ".opencode/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
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
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "OpenCode exposes lifecycle hooks through in-process JavaScript/TypeScript plugins. AXM models the surface but does not serialize plugin hooks yet.",
        docs: [],
        sources: ["https://opencode.ai/docs/plugins/"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        writer: null,
        verified: null,
        reason: "AXM has not implemented in-process plugin hook writers.",
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
