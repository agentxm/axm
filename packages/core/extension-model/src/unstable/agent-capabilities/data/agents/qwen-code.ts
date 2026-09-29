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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".qwen/skills",
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

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".qwen/settings.json",
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
            path: ".qwen/settings.json",
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
        ],

        entryDialect: {
          activationField: {
            required: null,
            accepted: [null],
          },
          stdio: {
            typeField: { required: null, accepted: [null] },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: { required: null, accepted: [null] },
            urlKey: {
              "streamable-http": "httpUrl",
              sse: "url",
            },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
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
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".qwen/agents",
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
          "Qwen Code hooks run command hooks from settings files and use JSON on stdin/stdout. Native Qwen Code also exposes HTTP hooks and additional events such as SessionEnd, PostToolUseFailure, SubagentStart, PostCompact, Notification, and PermissionRequest; this catalog maps the subset covered by AXM's canonical hook event registry.",
        docs: [],
        sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".qwen/settings.json",
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
            path: ".qwen/settings.json",
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
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "regex", example: "startup|resume|clear", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-08-05",
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
            lastVerified: "2026-08-05",
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
            lastVerified: "2026-08-05",
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
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-08-05",
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
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "regex", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/hooks/"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "ReadFile",
            canonical: "file.read",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "WriteFile",
            canonical: "file.write",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/file-system/"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://qwenlm.github.io/qwen-code-docs/en/developers/tools/shell/"],
            lastVerified: "2026-08-05",
          },
        ],

        entryDialect: {
          serializer: "command-stdin",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "milliseconds",
          commandNameSerialization: "manifest",
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
      notes:
        "Qwen Code loads QWEN.md from the project root and ~/.qwen/QWEN.md, and also reads AGENTS.md when present. AXM targets the universal AGENTS.md convention for project rules.",
      docs: [],
      sources: ["https://qwenlm.github.io/qwen-code-docs/en/users/features/memory/"],
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
        "Qwen Code grades tool access through a Claude Code-style permissions block with allow/ask/deny rule arrays. The legacy tools.allowed and tools.exclude keys are deprecated and migrate into permissions on first load; tools.approvalMode still sets the coarse default mode.",
      docs: [],
      sources: [
        "https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/",
        "https://qwenlm.github.io/qwen-code-docs/en/users/features/approval-mode/",
        "https://qwenlm.github.io/qwen-code-docs/en/developers/tools/shell/",
        "https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".qwen/settings.json",
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
          path: ".qwen/settings.json",
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
        example: "Bash(axm *)",
        notes:
          "Tool(pattern) rules sorted into permissions.allow, permissions.ask, and permissions.deny; deny wins over ask over allow. Approval modes are plan/default/auto-edit/auto/yolo set by tools.approvalMode (Default is surfaced as 'Ask Permissions'; the value stays 'default').\n",
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
            destination: { kind: "location", locationId: "user" },
            patch: {
              permissions: {
                allow: ["Bash(${tool} *)"],
              },
            },
            template: null,
          },
          filesystem: {
            destination: { kind: "location", locationId: "user" },
            patch: {
              permissions: {
                allow: ["Read(${workspaceRoot}/**)", "Edit(${workspaceRoot}/**)"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
