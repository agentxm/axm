import type { Agent } from "../../schema.js";

export const qwenCodeAgent = {
  id: "qwen-code",
  name: "Qwen Code",
  vendor: "Alibaba Cloud",
  homepage: "https://qwenlm.github.io/qwen-code-docs/",
  interfaces: ["cli"],
  family: "alibaba",
  rootDir: ".qwen",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Qwen Code documentation",
      url: "https://qwenlm.github.io/qwen-code-docs/",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".qwen/skills",
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
    sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/"],
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
          path: "~/.qwen/settings.json",
          format: "json",
        },
        {
          scope: "project",
          path: ".qwen/settings.json",
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
    lifecycle: "available",
    notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".qwen/agents",
    layout: "directory",
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
