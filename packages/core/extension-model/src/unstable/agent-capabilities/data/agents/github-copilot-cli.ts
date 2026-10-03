import type { Agent } from "../../schema.js";

export const githubCopilotCliAgent = {
  id: "github-copilot-cli",
  name: "GitHub Copilot CLI",
  vendor: "GitHub",
  homepage: "https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli",
  interfaces: ["cli"],
  family: "github",
  profile: {
    identity: {
      product: "GitHub Copilot",
      surface: "CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://github.com/github/copilot-cli/blob/main/changelog.md",
        "https://docs.github.com/en/copilot/reference/hooks-reference",
      ],
      conditions: [],
      limitations: [
        "CLI instructions/inheritance and hook mechanisms reviewed. CLI version and agent instruction opt-in affect behavior.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".copilot",
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [
        {
          kind: "dir",
          path: ".github/copilot",
          signal: "supporting",
          note: "Repository and local Copilot CLI settings live under .github/copilot.",
        },
      ],
    },
    user: {
      markers: [
        {
          kind: "dir",
          path: "~/.copilot",
          signal: "definitive",
          note: null,
        },
        {
          kind: "executable",
          name: "copilot",
          signal: "definitive",
          note: "CLI on PATH.",
        },
      ],
    },
  },
  docs: [
    {
      label: "GitHub Copilot CLI documentation",
      url: "https://docs.github.com/en/copilot/how-tos/copilot-cli",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes: null,
        docs: [],
        sources: [
          "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills",
          "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".github/skills",
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
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes: null,
        docs: [],
        sources: [
          "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers",
          "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
          "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
          "https://github.com/github/copilot-cli/issues/1232#issuecomment-4198097885",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".copilot/mcp-config.json",
            configRootRelativePath: "mcp-config.json",
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
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".mcp.json",
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
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
          {
            id: "project-github",
            scope: "project",
            root: "project",
            path: ".github/mcp.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
        ],
        entryDialect: {
          activationField: {
            required: null,
            accepted: [null],
          },
          stdio: {
            typeField: {
              required: {
                name: "type",
                value: "stdio",
              },
              accepted: [
                {
                  name: "type",
                  value: "stdio",
                },
                {
                  name: "type",
                  value: "local",
                },
              ],
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
      axm: {
        status: "supported",
        lastVerified: null,
        writer: {
          config: {
            locationIds: ["user", "project"],
          },
        },
      },
    },
    subagent: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "No industry spec for subagents yet; GitHub Copilot CLI custom agents are Markdown agent profiles under .github/agents or ~/.copilot/agents.\n",
        docs: [],
        sources: [
          "https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents",
          "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".github/agents",
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
            path: ".copilot/agents",
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
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Copilot CLI documents command, HTTP and prompt hooks. AXM does not serialize its hook configuration.",
        docs: [],
        sources: [
          "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/overview",
          "https://docs.github.com/en/copilot/reference/hooks-reference",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
        locations: [],
        entryDialect: null,
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.github.com/en/copilot/reference/hooks-reference"],
          claimScope: "Native hook invocation families",
          conditions: [],
          limitations: [],
        },
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented a GitHub Copilot CLI hook writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes:
        "GitHub Copilot CLI supports AGENTS.md plus Copilot-specific instruction files; AXM syncs the cross-agent AGENTS.md convention.\n",
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions",
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
      ],
      nestedDiscovery: true,
      importSyntax: null,
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://github.com/github/copilot-cli/blob/main/changelog.md"],
        claimScope:
          "CLI 1.0.89 reads .claude/rules; custom-agent instruction inheritance is opt-in",
        conditions: [
          "Custom agents must set include-custom-instructions: true to inherit repository instructions.",
        ],
        limitations: [],
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
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes: null,
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools",
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/configure-copilot-cli",
        "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
      ],
      scopes: ["user", "project"],
      mechanism: ["cli-flag", "config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".copilot/permissions-config.json",
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
          id: "user-additional-1",
          scope: "user",
          root: "home",
          path: ".copilot/settings.json",
          shape: "file",
          role: "additional",
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
          path: ".github/copilot/settings.json",
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
        style: "prefix",
        example: "--allow-tool='shell(axm:*)'",
        notes:
          "Copilot CLI permission flags use tool-kind patterns such as shell(git:*), write(path), url(domain), or MCP_SERVER(tool). Deny rules take precedence over allow rules.\n",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--allow-tool='shell(${tool}:*)'",
          note: "Allow a command family without prompting.",
        },
        {
          flag: "--allow-all-tools",
          note: "Allow all available tools without prompting.",
        },
        {
          flag: "--allow-all",
          note: "Allow all tools, paths, and URLs.",
        },
        {
          flag: "--deny-tool",
          note: "Deny a tool pattern; deny rules take precedence over allow rules.",
        },
        {
          flag: "--available-tools",
          note: "Restrict the tools available to the session.",
        },
        {
          flag: "--excluded-tools",
          note: "Remove tools from the session.",
        },
        {
          flag: "--yolo",
          note: "Alias for allowing all tools, paths, and URLs.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: {
        grants: {
          shell: {
            destination: {
              kind: "invocation",
            },
            patch: null,
            template: "--allow-tool='shell(${tool}:*)'",
          },
          filesystem: {
            destination: {
              kind: "invocation",
            },
            patch: null,
            template: "--allow-tool='write(${workspaceRoot}/**)'",
          },
        },
      },
    },
  },
} as const satisfies Agent;
