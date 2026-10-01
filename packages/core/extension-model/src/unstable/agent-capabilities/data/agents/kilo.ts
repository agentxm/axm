import type { Agent } from "../../schema.js";
export const kiloAgent = {
  id: "kilo",
  name: "Kilo Code",
  vendor: "Kilo",
  homepage: "https://kilo.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".kilo",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kilo Code documentation",
      url: "https://kilo.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kilo.ai/docs/customize/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".kilo/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
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
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://kilo.ai/docs/automate/mcp/using-in-cli",
          "https://kilo.ai/docs/automate/mcp/using-in-kilo-code",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },

        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: "kilo.json",
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
            keyPath: ["mcp"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".config/kilo/kilo.json",
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
            keyPath: ["mcp"],
            attribution: "agent",
          },
        ],

        entryDialect: {
          activationField: {
            required: { name: "enabled", enabled: true, disabled: false },
            accepted: [{ name: "enabled", enabled: true, disabled: false }, null],
          },
          stdio: {
            typeField: {
              required: {
                name: "type",
                value: "local",
              },
              accepted: [
                {
                  name: "type",
                  value: "local",
                },
              ],
            },
            command: "array",
            envKey: "environment",
          },
          remote: {
            typeField: {
              required: {
                name: "type",
                value: {
                  "streamable-http": "remote",
                },
              },
              accepted: [
                {
                  name: "type",
                  value: {
                    "streamable-http": "remote",
                  },
                },
              ],
            },
            urlKey: {
              "streamable-http": "url",
            },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            locationIds: ["project", "user"],
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
        sources: ["https://kilo.ai/docs/customize/custom-subagents"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".kilo/agents",
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
            path: ".config/kilo/agents",
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
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://kilo.ai/docs/customize/custom-subagents"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "CLI project .kilo/agents and user ~/.config/kilo/agents Markdown files",
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://kilo.ai/docs/customize/custom-instructions"],
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
        "https://kilo.ai/docs/code-with-ai/platforms/cli",
        "https://kilo.ai/docs/getting-started/settings/auto-approving-actions",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".config/kilo/kilo.jsonc",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "jsonc",
          gitignored: false,
        },
        {
          id: "project",
          scope: "project",
          root: "project",
          path: "kilo.jsonc",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "jsonc",
          gitignored: false,
        },
        {
          id: "project-additional-1",
          scope: "project",
          root: "project",
          path: ".kilo/kilo.jsonc",
          shape: "file",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "jsonc",
          gitignored: false,
        },
      ],
      grammar: {
        style: "glob",
        example: "axm *",
        notes:
          'Permission values are "allow", "ask", or "deny". Object rules are wildcard matched, and the last matching rule wins.',
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
      product: "Kilo Code",
      surface: "Kilo CLI; editor extensions have separate configuration",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://kilo.ai/docs/customize/custom-subagents"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, hook, instructions, permissions.",
      ],
      claimScope: "CLI custom subagent paths and configuration precedence",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
