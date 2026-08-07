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
        directory: ".kilo/skills",
        additionalReadPaths: [
          { path: ".agents/skills", status: "compat" },
          { path: ".claude/skills", status: "compat" },
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
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            serversKey: "mcp",
            activationField: {
              required: { name: "enabled", enabled: true, disabled: false },
              accepted: [{ name: "enabled", enabled: true, disabled: false }, null],
            },
            targets: [
              {
                scope: "project",
                path: "kilo.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.config/kilo/kilo.json",
                format: "json",
              },
            ],
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
        directory: ".kilo/agents",
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://kilo.ai/docs/customize/custom-instructions"],
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
      sources: [
        "https://kilo.ai/docs/code-with-ai/platforms/cli",
        "https://kilo.ai/docs/getting-started/settings/auto-approving-actions",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [
        {
          scope: "user",
          path: "~/.config/kilo/kilo.jsonc",
          format: "jsonc",
          gitignored: false,
        },
        {
          scope: "project",
          path: "kilo.jsonc",
          format: "jsonc",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".kilo/kilo.jsonc",
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
            target: "kilo.jsonc",
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
            target: "kilo.jsonc",
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
