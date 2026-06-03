import type { Agent } from "../../schema.js";

export const neovateAgent = {
  id: "neovate",
  name: "Neovate",
  vendor: "Ant Group",
  homepage: "https://neovateai.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".neovate",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Neovate Code documentation",
      url: "https://neovateai.dev/docs/features",
    },
  ],
  skills: {
    lifecycle: "available",
    notes:
      "Neovate documents on-demand skills as a feature, but current public docs do not describe an Agent Skills-compatible SKILL.md directory.\n",
    docs: [],
    sources: ["https://neovateai.dev/docs/features"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "partial",
    convention: "vendor",
    directory: ".neovate/skills",
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
    sources: ["https://neovateai.dev/en/docs/mcp/"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio", "http", "sse"],
    config: {
      serversKey: "mcpServers",
      nativeEnabled: true,
      targets: [
        {
          scope: "user",
          path: "~/.neovate/mcp.json",
          format: "json",
        },
        {
          scope: "project",
          path: ".neovate/mcp.json",
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
