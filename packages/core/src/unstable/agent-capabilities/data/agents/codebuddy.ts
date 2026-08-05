import type { Agent } from "../../schema.js";
export const codebuddyAgent = {
  id: "codebuddy",
  name: "CodeBuddy",
  vendor: "Tencent Cloud",
  homepage: "https://www.codebuddy.ai/docs",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".codebuddy",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "CodeBuddy documentation",
      url: "https://www.codebuddy.ai/docs/ide/Introduction",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/ide/Introduction"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".codebuddy/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "CodeBuddy custom slash commands are Markdown files in .codebuddy/commands.",
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/cli/slash-commands"],
        scopes: ["user", "project"],
        directory: ".codebuddy/commands",
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
          "CodeBuddy MCP configs are JSONC and use first-existing-file precedence within each scope; AXM writes the recommended project/user files.",
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/cli/mcp"],
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
                format: "jsonc",
              },
              {
                scope: "user",
                path: "~/.codebuddy/.mcp.json",
                format: "jsonc",
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
        sources: ["https://www.codebuddy.ai/docs/cli/sub-agents"],
        scopes: ["user", "project"],
        directory: ".codebuddy/agents",
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
          "CodeBuddy hooks are configured under the hooks key in settings.json and use grouped event/matcher command hooks compatible with AXM's command-stdin serializer.",
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "project",
            path: ".codebuddy/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "user",
            path: "~/.codebuddy/settings.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "literal-list", example: "startup|resume", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|Edit|Write", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny", "ask"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Edit|Write", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "literal-list", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://www.codebuddy.ai/docs/cli/settings"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://www.codebuddy.ai/docs/cli/settings"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "WebFetch",
            canonical: "web.fetch",
            sources: ["https://www.codebuddy.ai/docs/cli/settings"],
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
              path: ".codebuddy/settings.json",
              format: "json",
              gitignored: false,
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
      notes:
        "CodeBuddy loads CODEBUDDY.md plus nested .codebuddy/rules instruction files and supports @path imports.",
      docs: [],
      sources: ["https://www.codebuddy.ai/docs/cli/memory"],
      scopes: ["user", "project"],
      standardsCompliance: "none",
      convention: "vendor",
      kind: "own-file",
      files: ["CODEBUDDY.md"],
      nestedDiscovery: true,
      importSyntax: "at-path",
      directory: ".codebuddy/rules",
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
        "CodeBuddy permissions support allow/ask/deny rules in settings.json plus CLI permission flags. Bash rules are prefix-style and can include :* suffixes.",
      docs: [],
      sources: [
        "https://www.codebuddy.ai/docs/cli/settings",
        "https://www.codebuddy.ai/docs/cli/cli-reference",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "project",
          path: ".codebuddy/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".codebuddy/settings.local.json",
          format: "json",
          gitignored: true,
        },
        {
          scope: "user",
          path: "~/.codebuddy/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "Bash(axm:*)",
        notes:
          "Rules live in permissions.allow/ask/deny arrays; Bash patterns use prefix matching.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--dangerously-skip-permissions",
          note: "Bypasses CodeBuddy Code permission prompts.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: {
        grants: {
          shell: {
            target: ".codebuddy/settings.json",
            patch: {
              permissions: {
                allow: ["Bash(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            target: ".codebuddy/settings.json",
            patch: {
              permissions: {
                allow: ["Read(**)", "Write(**)", "Edit"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
