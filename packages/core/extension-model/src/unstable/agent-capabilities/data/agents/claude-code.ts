import type { Agent } from "../../schema.js";
export const claudeCodeAgent = {
  id: "claude-code",
  name: "Claude Code",
  vendor: "Anthropic",
  homepage: "https://claude.com/product/claude-code",
  interfaces: ["cli", "ide-extension"],
  family: "anthropic",
  rootDir: ".claude",
  targeting: {
    extends: null,
    capabilities: {
      "structured-input": {
        grades: ["native"],
        nouns: { "tool:structured-input": "AskUserQuestion" },
        affordances: {
          "do:ask-structured":
            "Use the AskUserQuestion tool to collect structured input, then STOP and wait for the response.",
        },
      },
    },
  },
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: {
      markers: [
        { kind: "dir", path: "~/.claude", signal: "definitive", note: null },
        { kind: "executable", name: "claude", signal: "definitive", note: "CLI on PATH." },
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://code.claude.com/docs/en/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".claude/skills",
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
        sources: ["https://code.claude.com/docs/en/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: true,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            serversKey: "mcpServers",
            activationField: {
              required: null,
              accepted: [null],
            },
            targets: [
              {
                scope: "project",
                path: ".mcp.json",
                format: "json",
                attribution: "shared",
              },
            ],
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
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://code.claude.com/docs/en/sub-agents"],
        scopes: ["user", "project"],
        directory: ".claude/agents",
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
          "Managed hooks merge into the Claude Code settings hooks block and execute materialized AXM package entrypoints. Claude Code exposes additional native events such as Notification, SessionEnd, CwdChanged, FileChanged, and WorktreeCreate; this catalog maps the subset covered by AXM's canonical hook event registry.",
        docs: [],
        sources: [
          "https://code.claude.com/docs/en/hooks",
          "https://code.claude.com/docs/en/settings",
        ],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.claude/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".claude/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".claude/settings.local.json",
            format: "json",
            gitignored: true,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Write|Edit", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny", "ask"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Write|Edit", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["inject-context"] },
            ],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://code.claude.com/docs/en/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
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
      },
      axm: {
        status: "supported",
        writer: {
          serializer: "command-stdin",
          configFiles: [
            {
              scope: "project",
              path: ".claude/settings.json",
              format: "json",
              gitignored: false,
            },
            {
              scope: "project",
              path: ".claude/settings.local.json",
              format: "json",
              gitignored: true,
            },
          ],
          settingsKey: "hooks",
          eventMap: "native.events",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "seconds",
          commandNameSerialization: "omit",
        },
        lastVerified: "2026-08-05",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Reads CLAUDE.md, not the AGENTS.md spec filename.",
      docs: [],
      sources: ["https://code.claude.com/docs/en/memory"],
      scopes: ["user", "project"],
      standardsCompliance: "parity",
      convention: "vendor",
      kind: "own-file",
      files: ["CLAUDE.md"],
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [
        "https://code.claude.com/docs/en/permissions",
        "https://code.claude.com/docs/en/settings",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.claude/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".claude/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".claude/settings.local.json",
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
            target: "~/.claude/settings.json",
            patch: {
              permissions: {
                allow: ["Bash(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            target: "~/.claude/settings.json",
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
