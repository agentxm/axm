import type { Agent } from "../../schema.js";

export const crushAgent = {
  id: "crush",
  name: "Crush",
  vendor: "Charm",
  homepage: "https://charm.land/crush",
  interfaces: ["cli"],
  family: null,
  rootDir: ".crush",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Crush repository",
      url: "https://github.com/charmbracelet/crush",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/charmbracelet/crush"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".crush/skills",
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
      sources: ["https://github.com/charmbracelet/crush"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      transports: ["stdio", "http"],
      config: {
        serversKey: "mcp",
        nativeEnabled: true,
        targets: [
          {
            scope: "project",
            path: "crush.json",
            format: "json",
          },
          {
            scope: "user",
            path: "~/.config/crush/crush.json",
            format: "json",
          },
        ],
        stdio: {
          typeField: null,
          command: "array",
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
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/charmbracelet/crush"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
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
