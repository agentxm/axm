import type { Agent } from "../../schema.js";
export const kimiCliAgent = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  vendor: "Moonshot AI",
  homepage: "https://github.com/MoonshotAI/kimi-cli",
  interfaces: ["cli"],
  family: "moonshot",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kimi CLI documentation",
      url: "https://moonshotai.github.io/kimi-cli/en/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://moonshotai.github.io/kimi-cli/en/customization/skills.html"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
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
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://moonshotai.github.io/kimi-cli/en/customization/mcp.html"],
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
        lastVerified: "2026-07-22",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: true,
            targets: [
              {
                scope: "user",
                path: "~/.kimi/mcp.json",
                format: "json",
              },
              {
                scope: "project",
                path: ".kimi/mcp.json",
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
                  sse: "http",
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
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Kimi CLI supports built-in and YAML-configured subagents loaded through --agent-file, but it does not document a fixed discovery directory that AXM's current subagent model can represent.",
        docs: [],
        sources: ["https://moonshotai.github.io/kimi-cli/en/customization/agents.html"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
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
        notes: "Kimi CLI uses AGENTS.md for project instructions.",
        docs: [],
        sources: ["https://github.com/MoonshotAI/kimi-cli/blob/main/AGENTS.md"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: false,
        importSyntax: null,
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
          "Kimi CLI hooks are declared in ~/.kimi/config.toml, execute commands with JSON on standard input, and can block selected events.",
        docs: [],
        sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
        scopes: ["user"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.kimi/config.toml",
            format: "toml",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|Read|Write", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny", "ask"] }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Bash|Read|Write", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://moonshotai.github.io/kimi-cli/en/customization/hooks.html"],
            lastVerified: "2026-07-22",
          },
        ],
        tools: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes:
        "Kimi CLI exposes binary YOLO-style approval flags, but granular config-file permission rules belong to the separate kimi-code product and are not modeled here.",
      docs: [],
      sources: ["https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html"],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
