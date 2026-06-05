import type { Agent } from "../../schema.js";

export const neovateAgent = {
  id: "neovate",
  name: "Neovate",
  vendor: "Ant Group",
  homepage: "https://neovateai.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".neovate",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Neovate Code documentation",
      url: "https://neovateai.dev/docs/features",
    },
  ],
  capabilities: {
    skill: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
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
    command: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    "mcp-server": {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
      notes: null,
      docs: [],
      sources: ["https://neovateai.dev/en/docs/mcp/"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
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
    subagent: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    files: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    hook: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    availability: { via: "none" },
    vendorStatus: { state: "active" },
    axmSupport: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
