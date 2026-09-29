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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".qoder/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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
          "Qoder CLI 1.1.64 expands braced environment references and unset-variable defaults in MCP headers and stdio env values.",
        docs: [],
        sources: [
          "https://docs.qoder.com/user-guide/chat/model-context-protocol",
          "https://docs.qoder.com/cli/mcp-servers",
          "https://unpkg.com/@qoder-ai/qodercli@1.1.64/bundle/qodercli.js",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: true,
        },

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".qoder/settings.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
        ],

        entryDialect: {
          activationField: {
            required: null,
            accepted: [null],
          },
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
      axm: {
        status: "supported",
        lastVerified: "2026-09-29",
        writer: {
          config: {
            locationIds: ["user", "project"],
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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".qoder/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".qoder/settings.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["hooks"],
            gitignored: false,
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".qoder/settings.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["hooks"],
            gitignored: false,
          },
          {
            id: "project-additional-1",
            scope: "project",
            root: "project",
            path: ".qoder/settings.local.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["hooks"],
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

        entryDialect: {
          serializer: "command-stdin",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "seconds",
          commandNameSerialization: "omit",
        },
      },
      axm: {
        status: "supported",
        writer: {
          locationIds: ["project"],

          eventMap: "native.events",
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
      locations: [
        {
          scope: "project",
          root: "project",
          path: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
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
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".qoder/settings.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "json",
          gitignored: false,
        },
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".qoder/settings.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
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
            destination: { kind: "location", locationId: "project" },
            patch: {
              permissions: {
                allow: ["Bash(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            destination: { kind: "location", locationId: "project" },
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
