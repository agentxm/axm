import type { Agent } from "../../schema.js";
export const antigravityAgent = {
  id: "antigravity",
  name: "Antigravity",
  vendor: "Google",
  homepage: "https://antigravity.google",
  interfaces: ["cli", "ide-extension"],
  family: "google",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        { kind: "dir", path: ".agents", signal: "definitive", note: null },
        { kind: "dir", path: ".agent", signal: "definitive", note: null },
      ],
    },
    user: {
      markers: [
        { kind: "dir", path: "~/.gemini/antigravity-cli", signal: "definitive", note: null },
      ],
    },
  },
  docs: [
    {
      label: "Antigravity documentation",
      url: "https://antigravity.google/docs",
    },
    {
      label: "Antigravity CLI overview",
      url: "https://antigravity.google/docs/cli-overview",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Antigravity 2.0 defaults to .agents/skills (project) and ~/.gemini/antigravity-cli/skills (user); .agent/skills remains supported for backward compatibility.\n",
        docs: [],
        sources: ["https://antigravity.google/docs/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          'Custom slash commands ("workflows") are Markdown files under .agents/workflows (project) or ~/.gemini/antigravity-cli/global_workflows (user). Commands have no industry spec yet.\n',
        docs: [],
        sources: ["https://antigravity.google/docs/rules-workflows"],
        scopes: ["user", "project"],
        directory: ".agents/workflows",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Antigravity CLI stores global MCP servers in ~/.gemini/antigravity-cli/mcp_config.json and workspace MCP servers in .agents/mcp_config.json. Remote MCP definitions use serverUrl.",
        docs: [],
        sources: ["https://antigravity.google/docs/cli-plugins"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: false,
            targets: [
              {
                scope: "user",
                path: "~/.gemini/antigravity-cli/mcp_config.json",
                format: "json",
              },
              {
                scope: "project",
                path: ".agents/mcp_config.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: null,
              urlKey: {
                "streamable-http": "serverUrl",
                sse: "serverUrl",
              },
              headersKey: "headers",
            },
            transform: null,
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
    files: {
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
    rule: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://antigravity.google/docs/project-context",
          "https://antigravity.google/docs/rules-workflows",
        ],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/rules",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Antigravity documents command hooks in hooks.json for the current Antigravity execution loop. This supersedes earlier research that found hooks only in SDK/plugin surfaces.",
        docs: [],
        sources: [
          "https://antigravity.google/docs/hooks",
          "https://antigravity.google/docs/cli-plugins",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason: "AXM has not implemented an Antigravity hooks writer.",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Antigravity CLI exposes fine-grained allow/ask/deny permissions in settings, with resources such as command(...), read_file(...), write_file(...), read_url(...), execute_url(...), and mcp(...).",
      docs: [],
      sources: [
        "https://antigravity.google/docs/cli-permissions",
        "https://antigravity.google/docs/cli-reference",
      ],
      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [
        {
          scope: "user",
          path: "~/.gemini/antigravity-cli/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "regex",
        example: "command(axm)",
        notes: "Conflicting rules are evaluated Deny > Ask > Allow.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: {
        grants: {
          shell: {
            target: "~/.gemini/antigravity-cli/settings.json",
            patch: {
              permissions: {
                allow: ["command(${tool})"],
              },
            },
            template: null,
          },
          filesystem: {
            target: "~/.gemini/antigravity-cli/settings.json",
            patch: {
              permissions: {
                allow: ["read_file(${workspaceRoot})", "write_file(${workspaceRoot})"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
