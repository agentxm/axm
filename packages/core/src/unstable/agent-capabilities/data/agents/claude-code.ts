import type { Agent } from "../../schema.js";
export const claudeCodeAgent = {
  id: "claude-code",
  name: "Claude Code",
  vendor: "Anthropic",
  homepage: "https://claude.com/claude-code",
  interfaces: ["cli", "ide-extension"],
  family: "anthropic",
  rootDir: ".claude",
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        {
          kind: "file",
          path: ".mcp.json",
          signal: "ambiguous",
          note: "Universal MCP file, not Claude-specific.",
        },
      ],
    },
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
      url: "https://docs.claude.com/en/docs/claude-code",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".claude/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom slash commands are Markdown prompt files under .claude/commands. Commands have no industry spec yet.\n",
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/slash-commands"],
        scopes: ["user", "project"],
        directory: ".claude/commands",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-18",
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
        support: "supported",
        lastVerified: "2026-05-16",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: false,
            targets: [
              {
                scope: "project",
                path: ".mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: {
                name: "type",
                value: "stdio",
              },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                name: "type",
                value: {
                  "streamable-http": "http",
                  sse: "sse",
                },
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
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
        sources: ["https://docs.claude.com/en/docs/claude-code/sub-agents"],
        scopes: ["user", "project"],
        directory: ".claude/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
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
        support: "unsupported",
        writer: null,
      },
    },
    rule: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Reads CLAUDE.md, not the AGENTS.md spec filename.",
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/memory"],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        kind: "own-file",
        files: ["CLAUDE.md"],
        nestedDiscovery: true,
        importSyntax: "at-path",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Managed hooks merge into the Claude Code settings hooks block and execute materialized AXM package entrypoints.",
        docs: [],
        sources: [
          "https://docs.claude.com/en/docs/claude-code/hooks",
          "https://docs.claude.com/en/docs/claude-code/settings",
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
            matcher: { kind: "regex", example: "Write|Edit|MultiEdit", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny", "ask"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Write|Edit|MultiEdit", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
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
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
        ],
        tools: [
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "MultiEdit",
            canonical: "file.edit",
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
          {
            nativeName: "WebFetch",
            canonical: "web.fetch",
            sources: ["https://docs.claude.com/en/docs/claude-code/hooks"],
            lastVerified: "2026-06-02",
          },
        ],
      },
      axm: {
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
        verified: "2026-06-02",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [
        "https://docs.claude.com/en/docs/claude-code/iam",
        "https://docs.claude.com/en/docs/claude-code/settings",
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
      support: "supported",
      lastVerified: "2026-05-18",
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
