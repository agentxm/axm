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
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://github.com/MoonshotAI/kimi-cli"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    directory: ".agents/skills",
  },
  commands: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  mcp: {
    lifecycle: "available",
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
  subagents: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  instructions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  rules: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  hooks: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
