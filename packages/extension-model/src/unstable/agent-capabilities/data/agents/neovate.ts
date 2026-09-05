import type { Agent } from "../../schema.js";
export const neovateAgent = {
  id: "neovate",
  name: "Neovate",
  vendor: "Ant Group",
  homepage: "https://github.com/neovateai/neovate-code",
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
      url: "https://github.com/neovateai/neovate-code",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Neovate loads directory-based skills (each subdirectory contains a SKILL.md with name+description frontmatter) from .neovate/skills (project) and ~/.neovate/skills (user).",
        docs: [],
        sources: ["https://github.com/neovateai/neovate-code/blob/master/src/skill.ts"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".neovate/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://github.com/neovateai/neovate-code/blob/master/src/mcp.ts",
          "https://github.com/neovateai/neovate-code/blob/master/src/config.ts",
          "https://github.com/neovateai/neovate-code/blob/master/src/commands/mcp.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            serversKey: "mcpServers",
            activationField: {
              required: { name: "disable", enabled: false, disabled: true },
              accepted: [{ name: "disable", enabled: false, disabled: true }, null],
            },
            targets: [
              {
                scope: "user",
                path: "~/.neovate/config.json",
                format: "json",
                attribution: "agent",
              },
              {
                scope: "project",
                path: ".neovate/config.json",
                format: "json",
                attribution: "agent",
              },
            ],
            stdio: {
              typeField: {
                required: { name: "type", value: "stdio" },
                accepted: [{ name: "type", value: "stdio" }, null],
              },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                required: {
                  name: "type",
                  value: {
                    "streamable-http": "http",
                    sse: "sse",
                  },
                },
                accepted: [
                  {
                    name: "type",
                    value: {
                      "streamable-http": "http",
                      sse: "sse",
                    },
                  },
                ],
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: "headers",
            },
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
