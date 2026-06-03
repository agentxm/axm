import type { Agent } from "../../schema.js";

export const gooseAgent = {
  id: "goose",
  name: "Goose",
  vendor: "Block",
  homepage: "https://block.github.io/goose",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".goose",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Goose documentation",
      url: "https://block.github.io/goose/docs",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://block.github.io/goose/docs"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".goose/skills",
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
      sources: ["https://block.github.io/goose/docs/getting-started/using-extensions"],
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
            path: "~/.config/goose/config.yaml",
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
