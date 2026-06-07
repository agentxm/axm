import type { Agent } from "../../schema.js";
export const kiloAgent = {
  id: "kilo",
  name: "Kilo Code",
  vendor: "Kilo",
  homepage: "https://kilo.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".kilocode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kilo Code documentation",
      url: "https://kilo.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kilo.ai/docs/customize/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".kilocode/skills",
      },
      axm: {
        status: "supported",
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
        sources: ["https://kilo.ai/docs/customize/workflows"],
        scopes: ["user", "project"],
        directory: ".kilo/commands",
      },
      axm: {
        status: "supported",
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
        sources: ["https://kilo.ai/docs/features/mcp/using-mcp-in-kilo-code"],
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
        status: "supported",
        lastVerified: "2026-05-20",
        writer: {
          config: {
            serversKey: "mcp",
            nativeEnabled: true,
            targets: [
              {
                scope: "user",
                path: "~/.config/kilo/kilo.jsonc",
                format: "jsonc",
              },
              {
                scope: "project",
                path: "kilo.jsonc",
                format: "jsonc",
              },
              {
                scope: "project",
                path: ".kilo/kilo.jsonc",
                format: "jsonc",
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
                  sse: "remote",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://kilo.ai/docs/customize/custom-subagents"],
        scopes: ["user", "project"],
        directory: ".kilo/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
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
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    rule: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kilo.ai/docs/agent-behavior/custom-instructions"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        status: "supported",
        lastVerified: "2026-05-20",
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
} as const satisfies Agent;
