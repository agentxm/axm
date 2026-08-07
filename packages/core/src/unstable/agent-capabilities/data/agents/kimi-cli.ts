import type { Agent } from "../../schema.js";
export const kimiCliAgent = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  vendor: "Moonshot AI",
  homepage: "https://www.kimi.com/code/docs/en/kimi-code-cli/",
  interfaces: ["cli"],
  family: "moonshot",
  rootDir: ".kimi-code",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.kimi-code", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Kimi Code CLI documentation",
      url: "https://www.kimi.com/code/docs/en/kimi-code-cli/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Kimi Code discovers skills from Kimi-specific and cross-tool directories; AXM writes the universal .agents/skills location.",
        docs: [],
        sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
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
        sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html"],
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
              accepted: [{ name: "enabled", enabled: true, disabled: false }, null],
            },
            targets: [
              {
                scope: "project",
                path: ".kimi-code/mcp.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.kimi-code/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: { required: null, accepted: [null] },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                required: {
                  name: "transport",
                  value: { "streamable-http": "http", sse: "sse" },
                },
                accepted: [
                  null,
                  {
                    name: "transport",
                    value: { "streamable-http": "http", sse: "sse" },
                  },
                ],
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: "headers",
              bearerTokenEnvKey: "bearerTokenEnvVar",
            },
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Kimi Code recursively discovers Markdown custom agents with YAML frontmatter and can delegate to them as subagents.",
        docs: [],
        sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html"],
        scopes: ["user", "project"],
        directory: ".kimi-code/agents",
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
          "Kimi Code hooks are TOML array entries, execute commands with JSON on standard input, and can block selected events.",
        docs: [],
        sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
        scopes: ["user"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.kimi-code/config.toml",
            format: "toml",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|Read|Write", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Bash|Read|Write", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "regex", example: "deploy|release", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM's grouped hook serializer cannot emit Kimi Code's flat TOML hook arrays.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Kimi Code loads AGENTS.md from project and Kimi-specific or cross-tool user locations.",
      docs: [],
      sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html"],
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
        "Kimi Code loads ordered allow, deny, and ask rules from its user configuration; invocation flags can still apply coarse session modes.",
      docs: [],
      sources: ["https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/config-files"],
      scopes: ["user"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.kimi-code/config.toml",
          format: "toml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: 'decision = "allow"; pattern = "Bash(axm *)"',
        notes:
          "Rules are ordered [[permission.rules]] tables whose first matching ToolName or ToolName(argument-pattern) rule wins.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--yolo",
          note: "Auto-approves all tool calls; aliased as --yes and --auto-approve.",
        },
        {
          flag: "--afk",
          note: "Auto-approves tool calls and auto-dismisses AskUserQuestion.",
        },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM does not serialize ordered TOML array-of-table permission rules.",
    },
  },
} as const satisfies Agent;
