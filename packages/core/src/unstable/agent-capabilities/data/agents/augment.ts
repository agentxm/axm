import type { Agent } from "../../schema.js";
export const augmentAgent = {
  id: "augment",
  name: "Augment",
  vendor: "Augment Code",
  homepage: "https://www.augmentcode.com",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".augment",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Augment documentation",
      url: "https://docs.augmentcode.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Auggie loads skills from .augment/skills, .claude/skills, and .agents/skills at both user and workspace scope. AXM writes the native Augment project directory.",
        docs: [],
        sources: ["https://docs.augmentcode.com/cli/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".augment/skills",
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
          "Auggie persists MCP server configuration in ~/.augment/settings.json. The CLI also supports per-run --mcp-config overrides that are not represented by AXM writers.",
        docs: [],
        sources: ["https://docs.augmentcode.com/cli/integrations"],
        scopes: ["user"],
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
              accepted: [null],
            },
            targets: [
              {
                scope: "user",
                path: "~/.augment/settings.json",
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
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.augmentcode.com/cli/subagents"],
        scopes: ["user", "project"],
        directory: ".augment/agents",
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
          "Auggie hooks run command hooks from settings files and use JSON on stdin/stdout. Native Auggie also exposes SessionEnd and Notification, plus metadata options not represented in AXM's portable hook manifest.",
        docs: [],
        sources: ["https://docs.augmentcode.com/cli/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.augment/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".augment/settings.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".augment/settings.local.json",
            format: "json",
            gitignored: true,
          },
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "terminal|write", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "terminal|write", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "read",
            canonical: "file.read",
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "write",
            canonical: "file.write",
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "edit",
            canonical: "file.edit",
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "terminal",
            canonical: "shell.exec",
            sources: ["https://docs.augmentcode.com/cli/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "web-fetch",
            canonical: "web.fetch",
            sources: ["https://docs.augmentcode.com/cli/hooks"],
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
              path: ".augment/settings.json",
              format: "json",
              gitignored: false,
            },
          ],
          settingsKey: "hooks",
          eventMap: "native.events",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "milliseconds",
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
      sources: ["https://docs.augmentcode.com/cli/rules"],
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
        "Auggie CLI evaluates toolPermissions top-to-bottom with first match winning. Tool permissions are CLI-only and live in ~/.augment/settings.json (user scope) or a repo-committed .augment/settings.json (project scope).",
      docs: [],
      sources: ["https://docs.augmentcode.com/cli/permissions"],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.augment/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".augment/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "regex",
        example: "^axm(\\s|$)",
        notes:
          "Rules contain toolName plus permission.type allow/deny/ask-user; shell commands can be constrained with shellInputRegex.",
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
            target: "~/.augment/settings.json",
            patch: {
              toolPermissions: [
                {
                  toolName: "terminal",
                  shellInputRegex: "^${tool}(\\s|$)",
                  permission: { type: "allow" },
                },
              ],
            },
            template: null,
          },
          filesystem: {
            target: "~/.augment/settings.json",
            patch: {
              toolPermissions: [
                { toolName: "read", permission: { type: "allow" } },
                { toolName: "edit", permission: { type: "allow" } },
                { toolName: "write", permission: { type: "allow" } },
              ],
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
