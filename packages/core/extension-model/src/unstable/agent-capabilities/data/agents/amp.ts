import type { Agent } from "../../schema.js";
export const ampAgent = {
  id: "amp",
  name: "Amp",
  vendor: "Sourcegraph",
  homepage: "https://ampcode.com",
  interfaces: ["cli", "ide-extension"],
  family: "sourcegraph",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Amp Owner's Manual",
      url: "https://ampcode.com/manual",
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
          "https://ampcode.com/manual#agent-skills",
          "https://ampcode.com/docs/customize/skills",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "universal",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
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
            path: ".config/agents/skills",
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
          {
            scope: "user",
            root: "home",
            path: ".config/amp/skills",
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
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: {
              kind: "conditional",
              condition: "Claude skill discovery must be enabled.",
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
            status: "compat",
            applicability: {
              kind: "conditional",
              condition: "Claude skill discovery must be enabled.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://ampcode.com/docs/customize/skills"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope:
            "Documented skill roots, compatibility discovery and optional hosted skill repositories",
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
          "Amp declares always-available MCP servers under the flat amp.mcpServers settings key in ~/.config/amp/settings.json (user) or .amp/settings.json (workspace, which requires explicit approval), and skill-scoped MCP servers through mcp.json inside a skill directory.",
        docs: [],
        sources: ["https://ampcode.com/manual#MCP", "https://ampcode.com/manual#configuration"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Amp's native configuration locations and server entry dialect have not been verified in the catalog; an AXM writer requires those declarations.",
      },
    },
    subagent: {
      native: {
        availability: {
          via: "plugin",
          provider: "first-party",
          plugin: {
            name: "Amp plugin API",
            homepage: "https://ampcode.com/manual",
            author: "Amp",
            distribution: {
              mechanism: "agent-native",
              installHint: "Save a plugin under .amp/plugins and reload plugins.",
              packageRef: null,
            },
            detection: {
              paths: [
                {
                  scope: "project",
                  path: ".amp/plugins",
                  kind: "dir",
                },
                {
                  scope: "user",
                  path: "~/.config/amp/plugins",
                  kind: "dir",
                },
              ],
              configKeys: [],
            },
          },
        },
        vendorStatus: { state: "active" },
        notes:
          "Amp has built-in automatic subagents and first-party plugin APIs for custom subagent-like tools, but no documented Markdown subagent directory that AXM can materialize.",
        docs: [],
        sources: ["https://ampcode.com/manual#subagents", "https://ampcode.com/manual#plugins"],
        scopes: ["user", "project"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented Amp plugin/subagent materialization.",
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Amp plugins can handle tool-call, tool-result, and agent lifecycle events. AXM models the in-process plugin surface but does not serialize Amp plugins or amp.hooks actions yet.",
        docs: [],
        sources: ["https://ampcode.com/manual", "https://ampcode.com/manual/plugin-api"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented Amp plugin or declarative-action hook writers.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [
        "https://ampcode.com/manual#agentsmd",
        "https://ampcode.com/docs/customize/agents-md",
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
          path: ".config/amp/AGENTS.md",
          shape: "file",
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
          path: ".config/AGENTS.md",
          shape: "file",
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
      nestedDiscovery: true,
      importSyntax: "at-path",

      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://ampcode.com/docs/customize/agents-md"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "Hosted workspace guidance does not apply to every custom or built-in subagent.",
        ],
        claimScope: "AGENTS.md search and personal/workspace guidance",
      },
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
        "Amp permission rules use the amp.permissions and amp.mcpPermissions settings. Enterprise administrators can enforce the same schema through platform-specific managed-settings.json files.",
      docs: [],
      sources: [
        "https://ampcode.com/news/tool-level-permissions",
        "https://ampcode.com/news/mcp-permissions",
        "https://ampcode.com/news/enterprise-managed-settings",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".config/amp/settings.json",
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
          path: ".amp/settings.json",
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
        style: "tool-call",
        example: '{"tool":"Bash","matches":{"cmd":"*git commit*"},"action":"ask"}',
        notes:
          "amp.permissions rules select a tool, optionally glob-match tool arguments, and apply allow, reject, ask, or delegate.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Amp",
      surface: "Amp CLI and editor integration",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://ampcode.com/docs/customize/skills",
        "https://ampcode.com/docs/customize/agents-md",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, permissions.",
      ],
      claimScope: "Skill discovery and global guidance",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
