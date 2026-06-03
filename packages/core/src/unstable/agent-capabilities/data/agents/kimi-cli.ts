import type { Agent } from "../../schema.js";

export const kimiCliAgent = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  vendor: "Moonshot AI",
  homepage: "https://github.com/MoonshotAI/kimi-cli",
  interfaces: ["cli"],
  family: "moonshot",
  rootDir: null,
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Kimi CLI repository",
      url: "https://github.com/MoonshotAI/kimi-cli",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/MoonshotAI/kimi-cli"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      directory: ".agents/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/MoonshotAI/kimi-cli"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      transports: ["stdio", "http"],
      config: {
        serversKey: "mcpServers",
        nativeEnabled: true,
        targets: [
          {
            scope: "user",
            path: "~/.kimi/mcp.json",
            format: "json",
          },
          {
            scope: "project",
            path: ".kimi/mcp.json",
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
          headersKey: "headers",
        },
        transform: null,
      },
    },
    subagent: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
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
