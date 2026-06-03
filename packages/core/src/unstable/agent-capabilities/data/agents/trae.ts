import type { Agent } from "../../schema.js";

export const traeAgent = {
  id: "trae",
  name: "Trae",
  vendor: "ByteDance",
  homepage: "https://www.trae.ai",
  interfaces: ["ide-extension"],
  family: "bytedance",
  rootDir: null,
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Trae documentation",
      url: "https://docs.trae.ai",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://github.com/HighMark-31/TRAE-Tips/blob/main/Agents-Rules-Skills.md"],
    lastVerified: "2026-05-20",
    scopes: ["project"],
    standardsCompliance: "partial",
    convention: "vendor",
    directory: ".trae/skills",
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
    sources: ["https://traeide.com/news/6"],
    lastVerified: "2026-05-20",
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio", "http", "sse"],
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
    lifecycle: "available",
    notes: "No industry spec for rule files yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://github.com/HighMark-31/TRAE-Tips/blob/main/Agents-Rules-Skills.md"],
    lastVerified: "2026-05-20",
    scopes: ["project"],
    directory: ".trae/rules",
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
