import type { Agent } from "../../schema.js";

export const commandCodeAgent = {
  id: "command-code",
  name: "Command Code",
  vendor: "Command Code",
  homepage: "https://commandcode.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".commandcode",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Command Code documentation",
      url: "https://commandcode.ai/docs",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://commandcode.ai/docs/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".commandcode/skills",
  },
  commands: {
    lifecycle: "available",
    notes:
      "Skills are also surfaced in Command Code's slash menu; custom commands and skills share the same invocation surface.\n",
    docs: [],
    sources: ["https://commandcode.ai/docs/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".commandcode/commands",
  },
  mcp: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://commandcode.ai/features"],
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
          scope: "project",
          path: ".commandcode/mcp.json",
          format: "json",
        },
        {
          scope: "user",
          path: "~/.commandcode/mcp.json",
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
