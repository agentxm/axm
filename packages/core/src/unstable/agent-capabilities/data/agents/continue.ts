import type { Agent } from "../../schema.js";
export const continueAgent = {
  id: "continue",
  name: "Continue",
  vendor: "Continue",
  homepage: "https://www.continue.dev",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".continue",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Continue documentation",
      url: "https://docs.continue.dev",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.continue.dev"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".continue/skills",
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
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.continue.dev/customize/deep-dives/prompts"],
        scopes: ["user", "project"],
        directory: ".continue/prompts",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Continue agent-mode tools include MCP servers configured as tools in Continue config. AXM does not currently write Continue's YAML/config package format.",
        docs: [],
        sources: [
          "https://docs.continue.dev/guides/configuring-models-rules-tools",
          "https://docs.continue.dev/reference/config",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-06-06",
        writer: null,
        reason: "AXM has not implemented a Continue MCP config writer.",
      },
    },
    subagent: {
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
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "The Continue CLI ships a Claude Code-compatible hooks system keyed under settings.json hooks, merged across ~/.continue, .continue, and the matching .claude locations. Beyond the events mapped here it also fires PostToolUseFailure, PermissionRequest, SessionEnd, Notification, SubagentStart, ConfigChange, TeammateIdle, TaskCompleted, WorktreeCreate, and WorktreeRemove, which have no canonical AXM event. Command handlers sit beside http, prompt, and agent handler types, and the surface is not yet covered by the published Continue docs.",
        docs: [],
        sources: ["https://github.com/continuedev/continue/issues/11678"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.continue/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".continue/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".continue/settings.local.json",
            format: "json",
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
              notes:
                "Matchers select tools by name; an optional per-handler if condition narrows by argument, such as Edit(src/**).",
            },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Bash", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
        ],
        tools: [
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://github.com/continuedev/continue/issues/11678"],
            lastVerified: "2026-07-24",
          },
        ],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason:
          "Continue's hook surface is only described in tracking issues, not published reference docs, so the settings key and handler shape are not stable enough to write.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://docs.continue.dev/guides/configuring-models-rules-tools"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: false,
      importSyntax: null,
      directory: ".continue/rules",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "The Continue CLI sorts tool patterns into allow, ask, and exclude lists in a user-scoped permissions.yaml that the TUI writes as approvals are granted; there is no project-scoped permission file.",
      docs: [],
      sources: ["https://docs.continue.dev/cli/tool-permissions"],
      scopes: ["user"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.continue/permissions.yaml",
          format: "yaml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "glob",
        example: "Bash(axm *)",
        notes:
          "Tool(pattern) entries under allow, ask, or exclude; the argument pattern is a glob, as in Write(**/*.ts).",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--auto",
          note: "Allows every tool for the session; not tool-scoped.",
        },
        {
          flag: "--readonly",
          note: "Restricts the session to read-only tools.",
        },
        {
          flag: "--allow",
          note: "Adds a session allow rule for one tool pattern.",
        },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason:
        "permissions.yaml is owned by the Continue TUI and AXM has no writer for its YAML permission grammar.",
    },
  },
} as const satisfies Agent;
