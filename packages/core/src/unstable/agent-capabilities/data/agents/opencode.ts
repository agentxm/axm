import type { Agent } from "../../schema.js";
export const opencodeAgent = {
  id: "opencode",
  name: "OpenCode",
  vendor: "Anomaly",
  homepage: "https://opencode.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".opencode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "OpenCode documentation",
      url: "https://opencode.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://opencode.ai/docs/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".opencode/skills",
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
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://opencode.ai/docs/commands/"],
        scopes: ["user", "project"],
        directory: ".opencode/commands",
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
        notes: null,
        docs: [],
        sources: ["https://opencode.ai/docs/mcp-servers/", "https://opencode.ai/docs/config/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
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
            serversKey: "mcp",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: "opencode.jsonc",
                format: "jsonc",
              },
              {
                scope: "user",
                path: "~/.config/opencode/opencode.json",
                format: "json",
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
                },
              },
              urlKey: {
                "streamable-http": "url",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://opencode.ai/docs/agents/"],
        scopes: ["user", "project"],
        directory: ".opencode/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
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
        notes:
          "OpenCode reads AGENTS.md project rules, a global ~/.config/opencode/AGENTS.md, and Claude-compatible CLAUDE.md fallbacks. AXM can target the universal AGENTS.md project file.",
        docs: [],
        sources: ["https://opencode.ai/docs/rules/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
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
          "OpenCode exposes lifecycle hooks through in-process JavaScript/TypeScript plugins. AXM models the surface but does not serialize plugin hooks yet.",
        docs: [],
        sources: ["https://opencode.ai/docs/plugins/"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason: "AXM has not implemented in-process plugin hook writers.",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://opencode.ai/docs/permissions/", "https://opencode.ai/docs/config/"],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.config/opencode/opencode.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: "opencode.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "glob",
        example: "axm *",
        notes:
          'Permission values are "allow", "ask", or "deny". Object rules are pattern matched, and the last matching rule wins.',
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
            target: "opencode.json",
            patch: {
              permission: {
                bash: {
                  "*": "ask",
                  "${tool} *": "allow",
                },
              },
            },
            template: null,
          },
          filesystem: {
            target: "opencode.json",
            patch: {
              permission: {
                external_directory: {
                  "${workspaceRoot}/**": "allow",
                },
                read: {
                  "${workspaceRoot}/**": "allow",
                },
                edit: {
                  "${workspaceRoot}/**": "allow",
                },
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
