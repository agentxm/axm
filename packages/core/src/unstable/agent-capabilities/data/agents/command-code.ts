import type { Agent } from "../../schema.js";
export const commandCodeAgent = {
  id: "command-code",
  name: "Command Code",
  vendor: "Command Code",
  homepage: "https://commandcode.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".commandcode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Command Code documentation",
      url: "https://commandcode.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://commandcode.ai/docs/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".commandcode/skills",
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
        notes:
          "The shared/project-scoped MCP config is .mcp.json at the repo root; the user-scoped config is ~/.commandcode/mcp.json. A private local scope (~/.commandcode/projects/<slug>/mcp.json) also exists but is not managed here.",
        docs: [],
        sources: ["https://commandcode.ai/docs/mcp"],
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
              required: null,
              accepted: [null, { name: "enabled", enabled: true, disabled: false }],
            },
            targets: [
              {
                scope: "project",
                path: ".mcp.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.commandcode/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: {
                required: null,
                accepted: [
                  null,
                  { name: "transport", value: "stdio" },
                  { name: "type", value: "stdio" },
                ],
              },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                required: {
                  name: "transport",
                  value: {
                    "streamable-http": "http",
                    sse: "sse",
                  },
                },
                accepted: [
                  {
                    name: "transport",
                    value: {
                      "streamable-http": "http",
                      sse: "sse",
                    },
                  },
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Command Code Custom Agents / Sub-Agents are single Markdown files with frontmatter under .commandcode/agents (project) and ~/.commandcode/agents (user).",
        docs: [],
        sources: ["https://commandcode.ai/docs/core-concepts/custom-agents"],
        scopes: ["user", "project"],
        directory: ".commandcode/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Command Code documents a lifecycle hook system configured in settings.json. AXM has not modeled its native event dialect.",
        docs: [],
        sources: ["https://commandcode.ai/docs/hooks"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented a Command Code hook writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Command Code reads AGENTS.md memory/instruction files.",
      docs: [],
      sources: ["https://commandcode.ai/docs/core-concepts/memory"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Command Code exposes permission allow/deny lists and an autoApprove system in settings.json. AXM does not yet write these grants.",
      docs: [],
      sources: ["https://commandcode.ai/docs/core-concepts/settings"],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.commandcode/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".commandcode/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "Bash(axm:*)",
        notes: null,
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Command Code permission grant writer.",
    },
  },
} as const satisfies Agent;
