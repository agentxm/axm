import type { Agent } from "../../schema.js";
export const devinAgent = {
  id: "devin",
  name: "Devin CLI",
  vendor: "Cognition",
  homepage: "https://devin.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".devin",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".devin", signal: "definitive", note: null }] },
    user: {
      markers: [{ kind: "dir", path: "$XDG_CONFIG_HOME/devin", signal: "definitive", note: null }],
    },
  },
  docs: [
    {
      label: "Devin CLI documentation",
      url: "https://docs.devin.ai/cli",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Devin also reads universal .agents/skills locations; AXM targets the native .devin/skills project path and XDG user path.\n",
        docs: [],
        sources: ["https://docs.devin.ai/cli/extensibility/skills/overview"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".devin/skills",
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
          "Devin CLI stores MCP servers under mcpServers in layered config files. Remote URL servers default to Streamable HTTP and can fall back to SSE.",
        docs: [],
        sources: ["https://docs.devin.ai/cli/extensibility/mcp/configuration"],
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
                scope: "project",
                path: ".devin/mcp_config.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.config/devin/mcp_config.json",
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
                  value: {
                    "streamable-http": "http",
                    sse: "sse",
                  },
                },
                accepted: [
                  {
                    name: "transport",
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
        notes:
          "Custom Devin CLI subagents are AGENT.md files under .devin/agents, .agents/agents, or the global Devin agents directory. Claude Code .claude/agents/*.md files are also imported.",
        docs: [],
        sources: ["https://docs.devin.ai/cli/subagents"],
        scopes: ["user", "project"],
        directory: ".devin/agents",
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
          "Devin CLI hooks are compatible with Claude Code hooks. AXM writes to the hooks key in .devin/config.json rather than the standalone hooks.v1.json file.",
        docs: [],
        sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "project",
            path: ".devin/hooks.v1.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".devin/config.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".devin/config.local.json",
            format: "json",
            gitignored: true,
          },
          {
            scope: "user",
            path: "~/.config/devin/config.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "exec|edit|write", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "exec|edit|write", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/cli/extensibility/hooks/overview"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "read",
            canonical: "file.read",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "write",
            canonical: "file.write",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "edit",
            canonical: "file.edit",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "exec",
            canonical: "shell.exec",
            sources: ["https://docs.devin.ai/cli/reference/permissions"],
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
              path: ".devin/config.json",
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
      sources: ["https://docs.devin.ai/cli/extensibility/rules"],
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
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Devin CLI permissions use allow/ask/deny arrays in layered config files. Rules cover scope matchers such as Read/Write/Exec/Fetch and tool names such as read/edit/grep/glob/exec.",
      docs: [],
      sources: ["https://docs.devin.ai/cli/reference/permissions"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "project",
          path: ".devin/config.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".devin/config.local.json",
          format: "json",
          gitignored: true,
        },
        {
          scope: "user",
          path: "~/.config/devin/config.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "Exec(axm)",
        notes:
          "Exec rules match shell command prefixes as complete words; Read/Write rules use glob-style path scopes.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--permission-mode",
          note: "Selects modes such as normal, accept edits, bypass, or autonomous with sandboxing.",
        },
        {
          flag: "--sandbox",
          note: "Enables OS-level sandboxing and autonomous permission behavior.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: {
        grants: {
          shell: {
            target: ".devin/config.json",
            patch: {
              permissions: {
                allow: ["Exec(${tool})"],
              },
            },
            template: null,
          },
          filesystem: {
            target: ".devin/config.json",
            patch: {
              permissions: {
                allow: ["Read(**)", "Write(**)", "edit"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
