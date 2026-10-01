import type { Agent } from "../../schema.js";

export const devinAgent = {
  id: "devin",
  name: "Devin CLI",
  vendor: "Cognition",
  homepage: "https://devin.ai",
  interfaces: ["cli"],
  family: null,
  profile: {
    identity: {
      product: "Devin",
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
        "https://docs.devin.ai/cli/subagents",
        "https://docs.devin.ai/cli/extensibility/mcp/configuration",
      ],
      conditions: [],
      limitations: [
        "Flat and directory subagent forms reviewed; MCP uses current CLI documentation rather than older desktop configuration descriptions.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".devin",
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [
        {
          kind: "dir",
          path: ".devin",
          signal: "definitive",
          note: null,
        },
      ],
    },
    user: {
      markers: [
        {
          kind: "dir",
          path: "$XDG_CONFIG_HOME/devin",
          signal: "definitive",
          note: null,
        },
      ],
    },
  },
  docs: [
    {
      label: "Devin CLI documentation",
      url: "https://docs.devin.ai/cli",
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
        notes:
          "Devin also reads universal .agents/skills locations; AXM targets the native .devin/skills project path and XDG user path.\n",
        docs: [],
        sources: ["https://docs.devin.ai/cli/extensibility/skills/overview"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".devin/skills",
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
    "mcp-server": {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Devin CLI stores MCP servers under mcpServers in layered config files. Remote URL servers default to Streamable HTTP and can fall back to SSE.",
        docs: [],
        sources: ["https://docs.devin.ai/cli/extensibility/mcp/configuration"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".devin/mcp_config.json",
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
            id: "user",
            scope: "user",
            root: "home",
            path: ".config/devin/mcp_config.json",
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
        ],
        entryDialect: {
          activationField: {
            required: {
              name: "disabled",
              enabled: false,
              disabled: true,
            },
            accepted: [
              {
                name: "disabled",
                enabled: false,
                disabled: true,
              },
              null,
            ],
          },
          stdio: {
            typeField: {
              required: null,
              accepted: [null],
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
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Custom Devin CLI subagents are AGENT.md files under .devin/agents, .agents/agents, or the global Devin agents directory. Claude Code .claude/agents/*.md files are also imported.",
        docs: [],
        sources: ["https://docs.devin.ai/cli/subagents"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".devin/agents",
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
          "Devin CLI hooks are compatible with Claude Code hooks. AXM writes to the hooks key in .devin/config.json rather than the standalone hooks.v1.json file.",
        docs: [],
        sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".devin/hooks.v1.json",
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
            keyPath: ["hooks"],
            gitignored: false,
          },
          {
            id: "project-additional-1",
            scope: "project",
            root: "project",
            path: ".devin/config.json",
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
            keyPath: ["hooks"],
            gitignored: false,
          },
          {
            id: "project-additional-2",
            scope: "project",
            root: "project",
            path: ".devin/config.local.json",
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
            keyPath: ["hooks"],
            gitignored: true,
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".config/devin/config.json",
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
            keyPath: ["hooks"],
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "modify",
                operations: ["inject-context"],
              },
            ],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "exec|edit|write",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
              {
                kind: "modify",
                operations: ["modify-input"],
              },
            ],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: {
              kind: "regex",
              example: "exec|edit|write",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "read",
            canonical: "file.read",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "write",
            canonical: "file.write",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "edit",
            canonical: "file.edit",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "exec",
            canonical: "shell.exec",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
        ],
        entryDialect: {
          serializer: "command-stdin",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "seconds",
          commandNameSerialization: "omit",
        },
      },
      axm: {
        status: "supported",
        writer: {
          locationIds: ["project-additional-1"],
          eventMap: "native.events",
        },
        lastVerified: "2026-08-05",
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
      notes: null,
      docs: [],
      sources: ["https://docs.devin.ai/cli/extensibility/rules"],
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
      notes:
        "Devin CLI permissions use allow/ask/deny arrays in layered config files. Rules cover scope matchers such as Read/Write/Exec/Fetch and tool names such as read/edit/grep/glob/exec.",
      docs: [],
      sources: ["https://docs.devin.ai/cli/reference/permissions"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".devin/config.json",
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
          id: "project-additional-1",
          scope: "project",
          root: "project",
          path: ".devin/config.local.json",
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
          gitignored: true,
        },
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".config/devin/config.json",
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
        example: "Exec(axm)",
        notes:
          "Exec rules match shell command prefixes as complete words; Read/Write rules use glob-style path scopes.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--permission-mode",
          note: "Selects modes such as normal, accept edits, bypass, or autonomous with sandboxing.",
        },
        {
          flag: "--sandbox",
          note: "Enables OS-level sandboxing and autonomous permission behavior.",
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
              kind: "location",
              locationId: "project",
            },
            patch: {
              permissions: {
                allow: ["Exec(${tool})"],
              },
            },
            template: null,
          },
          filesystem: {
            destination: {
              kind: "location",
              locationId: "project",
            },
            patch: {
              permissions: {
                allow: ["Read(**)", "Write(**)", "edit"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
