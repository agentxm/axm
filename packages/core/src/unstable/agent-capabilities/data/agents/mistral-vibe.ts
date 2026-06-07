import type { Agent } from "../../schema.js";
export const mistralVibeAgent = {
  id: "mistral-vibe",
  name: "Mistral Vibe",
  vendor: "Mistral AI",
  homepage: "https://docs.mistral.ai/mistral-vibe/overview",
  interfaces: ["cli"],
  family: "mistral",
  rootDir: ".vibe",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Mistral Vibe documentation",
      url: "https://docs.mistral.ai/mistral-vibe/overview",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.mistral.ai/mistral-vibe/agents-skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".vibe/skills",
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
        notes: null,
        docs: [],
        sources: ["https://docs.mistral.ai/mistral-vibe/terminal/configuration"],
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
        lastVerified: "2026-05-20",
        writer: {
          config: {
            serversKey: "mcp_servers",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: ".vibe/config.toml",
                format: "toml",
              },
              {
                scope: "user",
                path: "~/.vibe/config.toml",
                format: "toml",
              },
            ],
            stdio: {
              typeField: {
                name: "transport",
                value: "stdio",
              },
              command: "split",
              envKey: null,
            },
            remote: {
              typeField: {
                name: "transport",
                value: {
                  "streamable-http": "streamable-http",
                  sse: "http",
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
        sources: ["https://docs.mistral.ai/mistral-vibe/agents-skills"],
        scopes: ["user"],
        directory: ".vibe/agents",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.mistral.ai/mistral-vibe/agents-skills"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: false,
        importSyntax: null,
      },
      axm: {
        support: "supported",
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
