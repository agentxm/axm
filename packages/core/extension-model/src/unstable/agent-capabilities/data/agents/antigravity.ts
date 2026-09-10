import type { Agent } from "../../schema.js";
export const antigravityAgent = {
  id: "antigravity",
  name: "Antigravity",
  vendor: "Google",
  homepage: "https://antigravity.google",
  interfaces: ["ide-extension"],
  family: "google",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        { kind: "dir", path: ".agents", signal: "supporting", note: null },
        { kind: "dir", path: ".agent", signal: "supporting", note: null },
      ],
    },
    user: {
      markers: [
        { kind: "dir", path: "~/.gemini/antigravity-cli", signal: "definitive", note: null },
      ],
    },
  },
  docs: [
    {
      label: "Antigravity documentation",
      url: "https://antigravity.google/docs",
    },
    {
      label: "Antigravity CLI overview",
      url: "https://antigravity.google/docs/cli-overview",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Antigravity 2.0 defaults to .agents/skills (project) and ~/.gemini/config/skills (user); .agent/skills remains supported for backward compatibility.\n",
        docs: [],
        sources: ["https://antigravity.google/docs/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
        additionalReadPaths: [{ path: ".agent/skills", status: "compat" }],
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
          "Antigravity stores global MCP servers in ~/.gemini/config/mcp_config.json and workspace MCP servers in .agents/mcp_config.json. Remote MCP definitions use serverUrl, and disabled is an optional per-server switch.",
        docs: [],
        sources: [
          "https://antigravity.google/docs/mcp",
          "https://antigravity.google/docs/cli/plugins",
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
              required: { name: "disabled", enabled: false, disabled: true },
              accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
            },
            targets: [
              {
                scope: "user",
                path: "~/.gemini/config/mcp_config.json",
                format: "json",
                attribution: "agent",
              },
              {
                scope: "project",
                path: ".agents/mcp_config.json",
                format: "json",
                attribution: "agent",
              },
            ],
            stdio: {
              typeField: { required: null, accepted: [null] },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: { required: null, accepted: [null] },
              urlKey: {
                "streamable-http": "serverUrl",
                sse: "serverUrl",
              },
              headersKey: "headers",
            },
          },
        },
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
          "Antigravity documents command hooks in hooks.json for the current Antigravity execution loop. This supersedes earlier research that found hooks only in SDK/plugin surfaces. Each hooks.json entry is namespaced by a hook name that carries its own enabled flag, and event groups nest under that name rather than under a single top-level hooks key.",
        docs: [],
        sources: [
          "https://antigravity.google/docs/hooks",
          "https://antigravity.google/docs/cli/plugins",
        ],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.gemini/config/hooks.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".agents/hooks.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "browser_.*",
              notes: "Matches on tool name; * selects every tool.",
            },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny", "ask"] }],
            sources: ["https://antigravity.google/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "run_command", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://antigravity.google/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreInvocation",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://antigravity.google/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostInvocation",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://antigravity.google/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://antigravity.google/docs/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "run_command",
            canonical: "shell.exec",
            sources: ["https://antigravity.google/docs/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason:
          "Antigravity namespaces each hook bundle under its own top-level name in hooks.json; AXM's writer targets a single settings key and cannot express that nesting.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://antigravity.google/docs/rules-workflows"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      directory: ".agents/rules",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
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
        "Antigravity CLI exposes fine-grained allow/ask/deny permissions in settings, with resources such as command(...), read_file(...), write_file(...), read_url(...), execute_url(...), and mcp(...).",
      docs: [],
      sources: [
        "https://antigravity.google/docs/cli-permissions",
        "https://antigravity.google/docs/cli-reference",
      ],
      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [
        {
          scope: "user",
          path: "~/.gemini/antigravity-cli/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "regex",
        example: "command(axm)",
        notes: "Conflicting rules are evaluated Deny > Ask > Allow.",
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
            target: "~/.gemini/antigravity-cli/settings.json",
            patch: {
              permissions: {
                allow: ["command(${tool})"],
              },
            },
            template: null,
          },
          filesystem: {
            target: "~/.gemini/antigravity-cli/settings.json",
            patch: {
              permissions: {
                allow: ["read_file(${workspaceRoot})", "write_file(${workspaceRoot})"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
