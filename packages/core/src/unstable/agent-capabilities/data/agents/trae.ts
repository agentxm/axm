import type { Agent } from "../../schema.js";

export const traeAgent = {
  id: "trae",
  name: "Trae",
  vendor: "ByteDance",
  homepage: "https://www.trae.ai",
  interfaces: ["ide-extension"],
  family: "bytedance",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Trae documentation",
      url: "https://docs.trae.ai",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/HighMark-31/TRAE-Tips/blob/main/Agents-Rules-Skills.md"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      directory: ".trae/skills",
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
      sources: ["https://traeide.com/news/6"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      transports: ["stdio", "http", "sse"],
      mcpEnvExpansion: {
        variables: "none",
        defaults: false,
      },
      config: {
        serversKey: "mcpServers",
        nativeEnabled: true,
        targets: [
          {
            scope: "project",
            path: ".trae/mcp.json",
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
      lifecycle: "supported",
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://github.com/HighMark-31/TRAE-Tips/blob/main/Agents-Rules-Skills.md"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: false,
      importSyntax: null,
      directory: ".trae/rules",
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
