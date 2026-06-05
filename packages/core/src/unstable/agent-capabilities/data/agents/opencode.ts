import type { Agent } from "../../schema.js";

export const opencodeAgent = {
  id: "opencode",
  name: "OpenCode",
  vendor: "SST",
  homepage: "https://opencode.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".opencode",
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
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://opencode.ai/docs"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".opencode/skills",
    },
    command: {
      lifecycle: "supported",
      notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://opencode.ai/docs"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".opencode/commands",
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://opencode.ai/docs/mcp-servers/", "https://opencode.ai/docs/config/"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      transports: ["stdio", "http"],
      mcpEnvExpansion: {
        variables: "none",
        defaults: false,
      },
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
    subagent: {
      lifecycle: "supported",
      notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://opencode.ai/docs"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".opencode/agents",
      layout: "directory",
    },
    files: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    hook: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
