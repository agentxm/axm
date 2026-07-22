import type { Agent } from "../../schema.js";
export const geminiCliAgent = {
  id: "gemini-cli",
  name: "Gemini CLI",
  vendor: "Google",
  homepage: "https://github.com/google-gemini/gemini-cli",
  interfaces: ["cli"],
  family: "google",
  rootDir: ".gemini",
  lifecycle: {
    state: "retired",
    since: "2026-06-18",
    note: "On 2026-06-18 Gemini CLI stopped serving requests for individual/free/AI Pro/Ultra tiers, superseded by Antigravity CLI; enterprise and paid API-key access remains available.",
    supersededBy: "antigravity",
  },
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
        sources: ["https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
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
          "Custom slash commands are TOML files under .gemini/commands (project) or ~/.gemini/commands (user); AXM bridges its command extension format to TOML.\n",
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md",
        ],
        scopes: ["user", "project"],
        directory: ".gemini/commands",
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
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: true,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
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
          "Consumer access (free, AI Pro, AI Ultra) ended 2026-06-18; Antigravity CLI succeeded Gemini CLI for those tiers. Enterprise customers on paid API keys retain access. The contextFileName setting can also point Gemini CLI at AGENTS.md.\n",
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
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
          "Gemini CLI hooks run command hooks from settings files and use JSON on stdin/stdout. Native Gemini CLI exposes additional events such as SessionEnd, BeforeModel, AfterModel, BeforeToolSelection, and Notification; this catalog maps the subset covered by AXM's canonical hook event registry.",
        docs: [],
        sources: [
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md",
          "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
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
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: {
              kind: "regex",
              example: "startup|resume|clear",
              notes:
                "Gemini CLI lifecycle matchers are exact strings; AXM serializes raw matcher text.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "BeforeAgent",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["inject-context"] },
            ],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "AfterAgent",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["inject-context"] },
            ],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "BeforeTool",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "write_file|replace", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "AfterTool",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "write_file|replace", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["inject-context"] },
            ],
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "PreCompress",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md"],
            lastVerified: "2026-06-06",
          },
        ],
        tools: [
          {
            nativeName: "read_file",
            canonical: "file.read",
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "read_many_files",
            canonical: "file.read",
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "write_file",
            canonical: "file.write",
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "replace",
            canonical: "file.edit",
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "run_shell_command",
            canonical: "shell.exec",
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md",
            ],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "web_fetch",
            canonical: "web.fetch",
            sources: [
              "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md",
            ],
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
              path: ".gemini/settings.json",
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
        lastVerified: "2026-06-06",
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
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md",
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
          "The current configuration reference exposes tools.allowed / tools.core / tools.exclude (formerly coreTools/excludeTools) and the policy engine; command-specific run_shell_command rules are simple string matches and should not be treated as a strong security boundary.\n",
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
      status: "supported",
      lastVerified: "2026-07-22",
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
                allowed: ["run_shell_command(${tool})"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
