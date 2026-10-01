import type { Agent } from "../../schema.js";

export const claudeCodeAgent = {
  id: "claude-code",
  name: "Claude Code",
  vendor: "Anthropic",
  homepage: "https://claude.com/product/claude-code",
  interfaces: ["cli", "ide-extension"],
  family: "anthropic",
  profile: {
    identity: {
      product: "Claude Code",
      surface: "Terminal, IDE, desktop and cloud",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: ["https://code.claude.com/docs/en/hooks"],
      conditions: [],
      limitations: [
        "Hook mechanisms reviewed across documented surfaces. AXM currently writes command handlers; other handlers do not inherit AXM support.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".claude",
  targeting: {
    extends: null,
    capabilities: {
      "structured-input": {
        grades: ["native"],
        nouns: {
          "tool:structured-input": "AskUserQuestion",
        },
        affordances: {
          "do:ask-structured":
            "Use the AskUserQuestion tool to collect structured input, then STOP and wait for the response.",
        },
      },
    },
  },
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [],
    },
    user: {
      markers: [
        {
          kind: "dir",
          path: "~/.claude",
          signal: "definitive",
          note: null,
        },
        {
          kind: "executable",
          name: "claude",
          signal: "definitive",
          note: "CLI on PATH.",
        },
      ],
    },
  },
  docs: [
    {
      label: "Claude Code documentation",
      url: "https://code.claude.com/docs/en/overview",
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
        sources: ["https://code.claude.com/docs/en/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
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
            configRootRelativePath: "skills",
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
        notes: null,
        docs: [],
        sources: ["https://code.claude.com/docs/en/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: true,
        },
        locations: [
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
                null,
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
        lastVerified: "2026-08-05",
        writer: {
          config: {
            locationIds: ["project"],
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
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://code.claude.com/docs/en/sub-agents"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".claude/agents",
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
            path: ".claude/agents",
            configRootRelativePath: "agents",
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
          "Managed hooks merge into the Claude Code settings hooks block and execute materialized AXM package entrypoints. Claude Code exposes additional native events such as Notification, SessionEnd, CwdChanged, FileChanged, and WorktreeCreate; this catalog maps the subset covered by AXM's canonical hook event registry.",
        docs: [],
        sources: [
          "https://code.claude.com/docs/en/hooks",
          "https://code.claude.com/docs/en/settings",
        ],
        scopes: ["user", "project"],
        mechanism: ["command-stdin", "http", "prompt", "agent", "mcp"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".claude/settings.json",
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
            configRootRelativePath: "settings.json",
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".claude/settings.json",
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
            path: ".claude/settings.local.json",
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
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "Write|Edit",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "block",
                outcomes: ["allow", "deny", "ask"],
              },
              {
                kind: "modify",
                operations: ["modify-input"],
              },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: {
              kind: "regex",
              example: "Write|Edit",
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
            sources: ["https://code.claude.com/docs/en/hooks"],
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
                kind: "block",
                outcomes: ["allow", "deny"],
              },
              {
                kind: "modify",
                operations: ["inject-context"],
              },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
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
              {
                kind: "modify",
                operations: ["inject-context"],
              },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
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
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
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
                kind: "block",
                outcomes: ["allow", "deny"],
              },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: {
              kind: "regex",
              example: "manual|auto",
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
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "WebFetch",
            canonical: "web.fetch",
            sources: ["https://code.claude.com/docs/en/hooks"],
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
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://code.claude.com/docs/en/hooks"],
          claimScope: "Native hook invocation families",
          conditions: [],
          limitations: [
            "Agent hooks are also documented. AXM projects command handlers only; other native handlers are descriptive.",
          ],
        },
      },
      axm: {
        status: "supported",
        writer: {
          locationIds: ["project", "project-additional-1"],
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
      notes: "Reads CLAUDE.md, not the AGENTS.md spec filename.",
      docs: [],
      sources: ["https://code.claude.com/docs/en/memory"],
      scopes: ["user", "project"],
      standardsCompliance: "parity",
      convention: "vendor",
      kind: "own-file",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "CLAUDE.md",
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
          path: ".claude/CLAUDE.md",
          configRootRelativePath: "CLAUDE.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "sources",
            sources: [
              "https://code.claude.com/docs/en/memory",
              "https://code.claude.com/docs/en/claude-directory",
            ],
          },
        },
      ],
      nestedDiscovery: true,
      importSyntax: "at-path",
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
        "https://code.claude.com/docs/en/permissions",
        "https://code.claude.com/docs/en/settings",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".claude/settings.json",
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
          configRootRelativePath: "settings.json",
        },
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".claude/settings.json",
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
          path: ".claude/settings.local.json",
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
      ],
      grammar: {
        style: "tool-call",
        example: "Bash(axm:*)",
        notes:
          "Tool(specifier) with * wildcards. Evaluated deny > ask > allow (first match wins). Settings merge across scopes rather than override.\n",
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
            destination: {
              kind: "location",
              locationId: "user",
            },
            patch: {
              permissions: {
                allow: ["Bash(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            destination: {
              kind: "location",
              locationId: "user",
            },
            patch: {
              permissions: {
                allow: [
                  "Read(${workspaceRoot}/**)",
                  "Write(${workspaceRoot}/**)",
                  "Edit(${workspaceRoot}/**)",
                ],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
