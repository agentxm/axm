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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".augment/skills",
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

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".augment/settings.json",
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
            locationIds: ["user"],
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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".augment/agents",
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
          "Auggie hooks run command hooks from settings files and use JSON on stdin/stdout. Native Auggie also exposes SessionEnd and Notification, plus metadata options not represented in AXM's portable hook manifest.",
        docs: [],
        sources: ["https://docs.augmentcode.com/cli/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".augment/settings.json",
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
            path: ".augment/settings.json",
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
            path: ".augment/settings.local.json",
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

        entryDialect: {
          serializer: "command-stdin",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "milliseconds",
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
      sources: ["https://docs.augmentcode.com/cli/rules"],
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
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".augment/settings.json",
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
          path: ".augment/settings.json",
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
            destination: { kind: "location", locationId: "user" },
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
            destination: { kind: "location", locationId: "user" },
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
