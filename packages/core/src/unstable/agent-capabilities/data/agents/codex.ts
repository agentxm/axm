import type { Agent } from "../../schema.js";
export const codexAgent = {
  id: "codex",
  name: "Codex",
  vendor: "OpenAI",
  homepage: "https://learn.chatgpt.com/docs",
  interfaces: ["cli", "ide-extension"],
  family: "openai",
  rootDir: ".codex",
  targeting: {
    extends: null,
    capabilities: {
      "structured-input": {
        grades: ["native"],
        nouns: { "tool:structured-input": "request_user_input" },
        affordances: {
          "do:ask-structured":
            "Use request_user_input to collect structured input, then STOP and wait for the response.",
        },
      },
    },
  },
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        {
          kind: "file",
          path: "AGENTS.md",
          signal: "ambiguous",
          note: "Shared instruction filename used by multiple agents.",
        },
      ],
    },
    user: {
      markers: [
        { kind: "dir", path: "~/.codex", signal: "definitive", note: null },
        { kind: "executable", name: "codex", signal: "definitive", note: "CLI on PATH." },
      ],
    },
  },
  docs: [
    {
      label: "Codex documentation",
      url: "https://learn.chatgpt.com/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Reads SKILL.md skills from repository (.agents/skills) and user (~/.agents/skills) locations with progressive disclosure, using the cross-tool Agent Skills convention rather than a .codex/ path.\n",
        docs: [],
        sources: ["https://developers.openai.com/codex/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "deprecated",
          since: null,
          note: "Deprecated in favor of agent skills.",
          supersededByType: "skill",
        },
        notes:
          "Custom prompts are user-scope Markdown slash commands in ~/.codex/prompts. Deprecated by OpenAI in favor of skills for reusable instructions, and there is no project-scoped command directory.\n",
        docs: [],
        sources: [
          "https://learn.chatgpt.com/docs/custom-prompts",
          "https://developers.openai.com/codex/cli/slash-commands",
        ],
        scopes: ["user"],
        directory: ".codex/prompts",
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
        notes: null,
        docs: [],
        sources: ["https://learn.chatgpt.com/docs/extend/mcp"],
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
        lastVerified: "2026-07-22",
        writer: {
          config: {
            serversKey: "mcp_servers",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: ".codex/config.toml",
                format: "toml",
              },
              {
                scope: "user",
                path: "~/.codex/config.toml",
                format: "toml",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: null,
              urlKey: {
                "streamable-http": "url",
              },
              headersKey: "http_headers",
            },
            transform: "codex-toml",
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom agents are standalone TOML files under .codex/agents (project) or ~/.codex/agents (user); a custom agent overrides a built-in of the same name.\n",
        docs: [],
        sources: ["https://learn.chatgpt.com/docs/agent-configuration/subagents"],
        scopes: ["user", "project"],
        directory: ".codex/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Codex lifecycle hooks are command hooks loaded from hooks.json or inline [hooks] tables next to active config layers.",
        docs: [],
        sources: ["https://learn.chatgpt.com/docs/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.codex/hooks.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".codex/hooks.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|apply_patch", notes: null },
            decision: [{ kind: "block", outcomes: ["deny"] }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PermissionRequest",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|apply_patch", notes: null },
            decision: [{ kind: "block", outcomes: ["deny"] }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Bash|apply_patch", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "block", outcomes: ["deny"] }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: {
              kind: "regex",
              example: "startup|resume|clear|compact",
              notes: null,
            },
            decision: [{ kind: "observe" }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "regex", example: null, notes: "Matcher filters subagent type." },
            decision: [{ kind: "observe" }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
        ],
        tools: [
          {
            nativeName: "apply_patch",
            canonical: "file.edit",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-07-22",
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
              path: ".codex/hooks.json",
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
        lastVerified: "2026-07-22",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://github.com/openai/codex/blob/main/docs/agents_md.md"],
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
      lastVerified: "2026-06-06",
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
        "https://learn.chatgpt.com/docs/config-file/config-reference",
        "https://learn.chatgpt.com/docs/permissions",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.codex/config.toml",
          format: "toml",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.codex/axm.config.toml",
          format: "toml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "glob",
        example: '[permissions.agentxm.filesystem.":workspace_roots"] "." = "write"',
        notes:
          "Permission profiles combine filesystem, network, and workspace-root rules. Narrower deny rules remain in force over broader readable or writable paths.\n",
      },
      prerequisites: [
        {
          key: "default_permissions",
          value: "agentxm",
          scope: "user",
          note: "Selects the named permission profile.",
        },
      ],
      cliFlags: [
        {
          flag: "--yolo",
          note: "Alias for danger-full-access; use only when broad local access is intentional.",
        },
        {
          flag: "--dangerously-bypass-approvals-and-sandbox",
          note: "Runs without local sandbox restrictions.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-07-22",
      writer: {
        grants: {
          shell: {
            target: "~/.codex/axm.config.toml",
            patch: {
              default_permissions: "agentxm",
              permissions: {
                agentxm: {
                  extends: ":workspace",
                },
              },
            },
            template: null,
          },
          filesystem: {
            target: "~/.codex/axm.config.toml",
            patch: {
              default_permissions: "agentxm",
              permissions: {
                agentxm: {
                  extends: ":workspace",
                  workspace_roots: {
                    "${workspaceRoot}": true,
                  },
                  filesystem: {
                    ":workspace_roots": {
                      ".": "write",
                    },
                  },
                  network: {
                    enabled: true,
                  },
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
