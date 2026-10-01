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
        sources: [
          "https://opencode.ai/docs/skills/",
          "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".opencode/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "xdg-config",
            path: "opencode/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://opencode.ai/docs/skills/"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Canonical and compatible project/home skills",
        },
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
          "OpenCode V2 stores server definitions beneath mcp.servers and expands {env:NAME} references without shell defaults.",
        docs: [],
        sources: [
          "https://opencode.ai/v2/docs/mcp-servers",
          "https://opencode.ai/v2/docs/config",
          "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/config.ts",
          "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/config/mcp.ts",
          "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "env-tag",
          defaults: false,
        },

        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: "opencode.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcp", "servers"],
            attribution: "agent",
          },
          {
            id: "project-jsonc",
            scope: "project",
            root: "project",
            path: "opencode.jsonc",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "jsonc",
            keyPath: ["mcp", "servers"],
            attribution: "agent",
          },
          {
            id: "project-directory",
            scope: "project",
            root: "project",
            path: ".opencode/opencode.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcp", "servers"],
            attribution: "agent",
          },
          {
            id: "project-directory-jsonc",
            scope: "project",
            root: "project",
            path: ".opencode/opencode.jsonc",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "jsonc",
            keyPath: ["mcp", "servers"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "xdg-config",
            path: "opencode/opencode.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcp", "servers"],
            attribution: "agent",
          },
          {
            id: "user-jsonc",
            scope: "user",
            root: "xdg-config",
            path: "opencode/opencode.jsonc",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "jsonc",
            keyPath: ["mcp", "servers"],
            attribution: "agent",
          },
        ],

        entryDialect: {
          activationField: {
            required: { name: "disabled", enabled: false, disabled: true },
            accepted: [null, { name: "disabled", enabled: false, disabled: true }],
          },
          stdio: {
            command: "array",
            envKey: "environment",
            typeField: {
              required: { name: "type", value: "local" },
              accepted: [{ name: "type", value: "local" }],
            },
          },
          remote: {
            urlKey: { "streamable-http": "url" },
            headersKey: "headers",
            typeField: {
              required: { name: "type", value: "remote" },
              accepted: [{ name: "type", value: "remote" }],
            },
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-09-29",
        writer: { config: { locationIds: ["project", "user"] } },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: [
          "https://opencode.ai/docs/agents/",
          "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".opencode/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "xdg-config",
            path: "opencode/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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

        locations: [],

        entryDialect: null,
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
      sources: [
        "https://opencode.ai/docs/rules/",
        "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts",
      ],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
        {
          scope: "user",
          root: "xdg-config",
          path: "opencode/AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: {
            kind: "sources",
            sources: [
              "https://opencode.ai/docs/rules/",
              "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts",
            ],
          },
        },
        {
          scope: "user",
          root: "home",
          path: ".claude/CLAUDE.md",
          shape: "file",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "conditional",
            condition:
              "Fallback when the OpenCode global AGENTS.md is absent and Claude Code prompt compatibility is enabled.",
          },
          provenance: { kind: "sources", sources: ["https://opencode.ai/docs/rules/"] },
        },
      ],
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
      sources: [
        "https://opencode.ai/docs/permissions/",
        "https://opencode.ai/docs/config/",
        "https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "xdg-config",
          path: "opencode/opencode.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "json",
          gitignored: false,
        },
        {
          id: "project",
          scope: "project",
          root: "project",
          path: "opencode.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
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
            destination: { kind: "location", locationId: "project" },
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
            destination: { kind: "location", locationId: "project" },
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

  profile: {
    identity: {
      product: "OpenCode",
      surface: "OpenCode CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://opencode.ai/docs/skills/"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Local skill discovery and compatible skill directories",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
