import type { Agent } from "../../schema.js";
export const qwenCodeAgent = {
  id: "qwen-code",
  name: "Qwen Code",
  vendor: "Alibaba Cloud",
  homepage: "https://qwenlm.github.io/qwen-code-docs/",
  interfaces: ["cli"],
  family: "alibaba",
  rootDir: ".qwen",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Qwen Code documentation",
      url: "https://qwenlm.github.io/qwen-code-docs/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".qwen/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Qwen Code supports custom slash commands as Markdown files. AXM can materialize project-scope command files through the descriptor fallback; user-scope command sync is not implemented.",
        docs: [],
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/"],
        scopes: ["user", "project"],
        directory: ".qwen/commands",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: true,
            targets: [
              {
                scope: "user",
                path: "~/.qwen/settings.json",
                format: "json",
              },
              {
                scope: "project",
                path: ".qwen/settings.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
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
                "streamable-http": "httpUrl",
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
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/"],
        scopes: ["user", "project"],
        directory: ".qwen/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
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
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    rule: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Qwen Code loads QWEN.md from the project root and ~/.qwen/QWEN.md, and also reads AGENTS.md when present. AXM targets the universal AGENTS.md convention for project rules.",
        docs: [],
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/memory/"],
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
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Qwen Code hooks run command hooks from settings files and use JSON on stdin/stdout. Native Qwen Code also exposes HTTP hooks and additional events such as SessionEnd, PostToolUseFailure, SubagentStart, PostCompact, Notification, and PermissionRequest; this catalog maps the subset covered by AXM's canonical hook event registry.",
        docs: [],
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.qwen/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".qwen/settings.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "regex", example: "startup|resume|clear", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-06-06",
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
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "WriteFile|Edit|Bash", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny", "ask"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "WriteFile|Edit|Bash", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["inject-context"] },
            ],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: {
              kind: "regex",
              example: "Bash|Explorer",
              notes: "Matcher targets the subagent type.",
            },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-06-06",
          },
        ],
        tools: [
          {
            nativeName: "ReadFile",
            canonical: "file.read",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "WriteFile",
            canonical: "file.write",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/shell/"],
            lastVerified: "2026-06-06",
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
              path: ".qwen/settings.json",
              format: "json",
              gitignored: false,
            },
          ],
          settingsKey: "hooks",
          eventMap: "native.events",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "milliseconds",
          commandNameSerialization: "manifest",
        },
        lastVerified: "2026-07-22",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Qwen Code exposes coarse approval modes for file edits and shell commands, plus MCP trust and tool include/exclude controls. The public docs do not describe a stable narrow AXM-specific grant writer for shell and filesystem approvals.",
      docs: [],
      sources: [
        "https://qwenlm.github.io/qwen-code-docs/en/users/features/approval-mode/",
        "https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/",
        "https://qwenlm.github.io/qwen-code-docs/en/developers/tools/shell/",
        "https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.qwen/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".qwen/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "prefix",
        example: 'tools.approvalMode = "auto-edit"',
        notes:
          "Approval modes are plan/default/auto-edit/auto/yolo (Default is now surfaced as 'Ask Permissions'; value stays 'default'). Shell restriction rules use tools.core and tools.exclude entries such as run_shell_command(git).",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-07-22",
      writer: null,
      reason: "No narrow Qwen Code permission grant writer is implemented for AXM.",
    },
  },
} as const satisfies Agent;
