import type { Agent } from "../../schema.js";
export const codebuddyAgent = {
  id: "codebuddy",
  name: "CodeBuddy",
  vendor: "Tencent Cloud",
  homepage: "https://www.codebuddy.ai/docs",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".codebuddy",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "CodeBuddy documentation",
      url: "https://www.codebuddy.ai/docs/ide/Introduction",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/ide/Introduction"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".codebuddy/skills",
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
          "CodeBuddy MCP configs are JSONC and use first-existing-file precedence within each scope; AXM writes the recommended project/user files.",
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/cli/mcp"],
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
            format: "jsonc",
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".codebuddy/.mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "jsonc",
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
            typeField: {
              required: {
                name: "type",
                value: "stdio",
              },
              accepted: [
                {
                  name: "type",
                  value: "stdio",
                },
                null,
              ],
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
        lastVerified: "2026-08-05",
        writer: {
          config: {
            locationIds: ["project", "user"],
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
        sources: ["https://www.codebuddy.ai/docs/cli/sub-agents"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".codebuddy/agents",
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
          "CodeBuddy hooks are configured under the hooks key in settings.json and use grouped event/matcher command hooks compatible with AXM's command-stdin serializer.",
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".codebuddy/settings.json",
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
            id: "user",
            scope: "user",
            root: "home",
            path: ".codebuddy/settings.json",
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
            matcher: { kind: "literal-list", example: "startup|resume", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|Edit|Write", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny", "ask"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Edit|Write", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "literal-list", example: "manual|auto", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://www.codebuddy.ai/docs/cli/settings"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://www.codebuddy.ai/docs/cli/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://www.codebuddy.ai/docs/cli/settings"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "WebFetch",
            canonical: "web.fetch",
            sources: ["https://www.codebuddy.ai/docs/cli/settings"],
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
      notes:
        "CodeBuddy loads CODEBUDDY.md plus nested .codebuddy/rules instruction files and supports @path imports.",
      docs: [],
      sources: ["https://www.codebuddy.ai/docs/cli/memory"],
      scopes: ["user", "project"],
      standardsCompliance: "none",
      convention: "vendor",
      kind: "own-file",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "CODEBUDDY.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
        {
          scope: "project",
          root: "project",
          path: ".codebuddy/rules",
          shape: "directory",
          role: "additional",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
      nestedDiscovery: true,
      importSyntax: "at-path",
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
        "CodeBuddy permissions support allow/ask/deny rules in settings.json plus CLI permission flags. Bash rules are prefix-style and can include :* suffixes.",
      docs: [],
      sources: [
        "https://www.codebuddy.ai/docs/cli/settings",
        "https://www.codebuddy.ai/docs/cli/cli-reference",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".codebuddy/settings.json",
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
          id: "project-additional-1",
          scope: "project",
          root: "project",
          path: ".codebuddy/settings.local.json",
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
          gitignored: true,
        },
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".codebuddy/settings.json",
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
        notes:
          "Rules live in permissions.allow/ask/deny arrays; Bash patterns use prefix matching.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--dangerously-skip-permissions",
          note: "Bypasses CodeBuddy Code permission prompts.",
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
                allow: ["Read(**)", "Write(**)", "Edit"],
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
