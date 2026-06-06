import type { Agent } from "../../schema.js";
export const geminiCliAgent = {
  id: "gemini-cli",
  name: "Gemini CLI",
  vendor: "Google",
  homepage: "https://github.com/google-gemini/gemini-cli",
  interfaces: ["cli"],
  family: "google",
  rootDir: ".gemini",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: {
      markers: [
        { kind: "dir", path: "~/.gemini", signal: "definitive", note: null },
        { kind: "executable", name: "gemini", signal: "definitive", note: "CLI on PATH." },
      ],
    },
  },
  docs: [
    {
      label: "Gemini CLI documentation",
      url: "https://github.com/google-gemini/gemini-cli/tree/main/docs",
    },
    {
      label: "Transitioning Gemini CLI to Antigravity CLI",
      url: "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".gemini/skills",
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
          "Custom slash commands are TOML files under .gemini/commands (project) or ~/.gemini/commands (user); AXM bridges its command extension format to TOML.\n",
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md",
        ],
        scopes: ["user", "project"],
        directory: ".gemini/commands",
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
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
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
                path: ".gemini/settings.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.gemini/settings.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: null,
            transform: null,
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Subagents are Markdown files with YAML frontmatter under .gemini/agents (project) or ~/.gemini/agents (user); shipped in Gemini CLI v0.38.1.\n",
        docs: [],
        sources: ["https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md"],
        scopes: ["user", "project"],
        directory: ".gemini/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-18",
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
        notes:
          "Consumer access (free, AI Pro, AI Ultra) ends 2026-06-18; Antigravity CLI succeeds Gemini CLI for those tiers. Enterprise customers on paid API keys retain access.\n",
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/configuration.md",
          "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        kind: "own-file",
        files: ["GEMINI.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Gemini CLI hooks run command hooks from settings files and use JSON on stdin/stdout. AXM serializes compatible command-stdin hook bindings through the catalog-driven writer.",
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md",
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
        ],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.gemini/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".gemini/settings.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "BeforeTool",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "/Write|Edit|MultiEdit/", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "AfterTool",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "/Write|Edit|MultiEdit/", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "BeforeAgent",
            canonical: "turn.start",
            matcher: { kind: "regex", example: "*", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "AfterAgent",
            canonical: "turn.end",
            matcher: { kind: "regex", example: "*", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "regex", example: "startup", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "SessionEnd",
            canonical: "session.end",
            matcher: { kind: "regex", example: "exit", notes: null },
            decision: [{ kind: "observe" }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "PreCompress",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "*", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "Notification",
            canonical: "notification",
            matcher: { kind: "regex", example: "*", notes: null },
            decision: [{ kind: "observe" }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "BeforeToolSelection",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "*", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["modify-input"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md",
            ],
            lastVerified: "2026-06-06",
          },
        ],
      },
      canonical: {
        events: [
          "tool.pre",
          "tool.post",
          "turn.start",
          "turn.end",
          "session.start",
          "session.end",
          "compaction.pre",
          "notification",
        ],
        mechanism: ["command-stdin"],
        matcherKinds: ["regex"],
        decision: [
          { kind: "observe" },
          { kind: "block", outcomes: ["allow", "deny"] },
          { kind: "modify", operations: ["modify-input", "inject-context"] },
        ],
      },
      axm: {
        support: "supported",
        lastVerified: "2026-06-06",
        writer: {
          serializer: "command-stdin",
          configFiles: [
            {
              scope: "project",
              path: ".gemini/settings.json",
              format: "json",
              gitignored: false,
            },
          ],
          settingsKey: "hooks",
          eventMap: "native.events",
          matcherKind: "regex",
          matcherSerialization: "slash-delimited",
          timeoutSerialization: "milliseconds",
          commandNameSerialization: "manifest",
        },
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
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md",
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/shell.md",
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.gemini/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".gemini/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "prefix",
        example: "run_shell_command(axm)",
        notes:
          "tools.core is prefix-matched and currently documented in docs/tools/shell.md. The newer Policy Engine is replacing --allowed-tools; tools.core is still functional but transitional.\n",
      },
      prerequisites: [
        {
          key: "security.folderTrust.enabled",
          value: "true",
          scope: "user",
          note: "Untrusted folders disable all auto-acceptance regardless of other settings.",
        },
      ],
      cliFlags: [
        {
          flag: "--approval-mode=yolo",
          note: "Broad bypass; not tool-scoped. Blocked when security.disableYoloMode=true.",
        },
        {
          flag: "--yolo",
          note: "Alias for --approval-mode=yolo.",
        },
      ],
    },
    axm: {
      support: "supported",
      lastVerified: "2026-05-18",
      writer: {
        grants: {
          shell: {
            target: "~/.gemini/settings.json",
            patch: {
              security: {
                folderTrust: {
                  enabled: true,
                },
                enablePermanentToolApproval: true,
              },
              tools: {
                core: ["run_shell_command(${tool})"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
