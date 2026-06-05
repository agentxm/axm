import type { Agent } from "../../schema.js";

export const kiloAgent = {
  id: "kilo",
  name: "Kilo Code",
  vendor: "Kilo",
  homepage: "https://kilo.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".kilocode",
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
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://kilo.ai/docs/customize/skills"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".kilocode/skills",
    },
    command: {
      lifecycle: "supported",
      notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://kilo.ai/docs/customize/workflows"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".kilo/commands",
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://kilo.ai/docs/features/mcp/using-mcp-in-kilo-code"],
      lastVerified: "2026-05-20",
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
    subagent: {
      lifecycle: "supported",
      notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://kilo.ai/docs/customize/custom-subagents"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".kilo/agents",
      layout: "directory",
    },
    files: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://kilo.ai/docs/agent-behavior/custom-instructions"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
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
