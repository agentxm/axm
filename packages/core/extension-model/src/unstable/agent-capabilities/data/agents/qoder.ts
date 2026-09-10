import type { Agent } from "../../schema.js";
export const qoderAgent = {
  id: "qoder",
  name: "Qoder",
  vendor: "Alibaba Cloud",
  homepage: "https://qoder.com",
  interfaces: ["cli", "ide-extension"],
  family: "alibaba",
  rootDir: ".qoder",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Qoder documentation",
      url: "https://docs.qoder.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.qoder.com/en/cli/Skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".qoder/skills",
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
          "https://docs.qoder.com/user-guide/chat/model-context-protocol",
          "https://docs.qoder.com/cli/mcp-servers",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
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
            serversKey: "mcpServers",
            activationField: {
              required: null,
              accepted: [null],
            },
            targets: [
              {
                scope: "user",
                path: "~/.qoder/settings.json",
                format: "json",
                attribution: "agent",
              },
              {
                scope: "project",
                path: ".mcp.json",
                format: "json",
                attribution: "shared",
              },
            ],
            stdio: {
              typeField: {
                required: null,
                accepted: [null, { name: "type", value: "stdio" }],
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
        sources: ["https://docs.qoder.com/en/cli/subagent"],
        scopes: ["user", "project"],
        directory: ".qoder/agents",
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
          "Qoder CLI hooks run command hooks from settings files and use JSON on stdin/stdout. Native Qoder exposes additional events such as SessionEnd, PostToolUseFailure, SubagentStart, Notification, and PermissionRequest; this catalog maps the subset covered by AXM's canonical hook event registry.",
        docs: [],
        sources: ["https://docs.qoder.com/en/cli/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.qoder/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".qoder/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".qoder/settings.local.json",
            format: "json",
            gitignored: true,
          },
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: {
              kind: "regex",
              example: "startup|resume|compact",
              notes: "Qoder matcher values can be exact strings, pipe-separated values, or regex.",
            },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Write|Edit|Bash", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny", "ask"] }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Write|Edit|Bash", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: {
              kind: "regex",
              example: "task",
              notes: "Matcher targets the agent type name.",
            },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://docs.qoder.com/en/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://docs.qoder.com/en/cli/hooks"],
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
              path: ".qoder/settings.json",
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
      notes: null,
      docs: [],
      sources: ["https://docs.qoder.com/en/cli/command"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
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
      notes:
        "Qoder permissions use allow/ask/deny rules in settings. User settings live under ~/.qoder/settings.json; project rules can live in .qoder/settings.json or .qoder/settings.local.json.",
      docs: [],
      sources: ["https://docs.qoder.com/en/cli/permissions"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.qoder/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".qoder/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "Bash(axm:*)",
        notes: null,
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--permission-mode",
          note: "Chooses the session permission mode.",
        },
        {
          flag: "--allowed-tools",
          note: "Allows specific tools or tool rules for a run.",
        },
        {
          flag: "--dangerously-skip-permissions",
          note: "Alias for --permission-mode bypass_permissions.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: {
        grants: {
          shell: {
            target: ".qoder/settings.json",
            patch: {
              permissions: {
                allow: ["Bash(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            target: ".qoder/settings.json",
            patch: {
              permissions: {
                allow: [
                  "Read(${workspaceRoot}/**)",
                  "Edit(${workspaceRoot}/**)",
                  "Write(${workspaceRoot}/**)",
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
