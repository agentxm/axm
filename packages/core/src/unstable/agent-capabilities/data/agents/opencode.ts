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
        additionalReadPaths: [
          { path: ".claude/skills", status: "compat" },
          { path: ".agents/skills", status: "compat" },
        ],
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
          "OpenCode V2 stores server definitions beneath mcp.servers; the native configuration is valid but requires a nested-map writer.",
        docs: [],
        sources: ["https://opencode.ai/v2/docs/mcp-servers", "https://opencode.ai/v2/docs/config"],
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
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "OpenCode V2 nests MCP server definitions under mcp.servers. AXM's generic MCP writer currently supports only a single keyed server-map level and would write the obsolete shape.",
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
        lastVerified: "2026-08-05",
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
        lastVerified: null,
        reason:
          "OpenCode hooks are in-process JavaScript plugin exports, not declarative config; AXM's command-stdin serializer has no way to emit them.",
      },
    },
  },
  instructions: {
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
      lastVerified: "2026-08-05",
      writer: null,
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
      lastVerified: "2026-08-05",
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
