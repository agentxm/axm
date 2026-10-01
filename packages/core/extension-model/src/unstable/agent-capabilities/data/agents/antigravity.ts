import type { Agent } from "../../schema.js";
export const antigravityAgent = {
  id: "antigravity",
  name: "Antigravity",
  vendor: "Google",
  homepage: "https://antigravity.google",
  interfaces: ["ide-extension"],
  family: "google",
  profile: {
    identity: {
      product: "Antigravity",
      surface: "Desktop/IDE",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://antigravity.google/docs/subagents/",
        "https://antigravity.google/docs/changelog/",
      ],
      conditions: [],
      limitations: [
        "Custom subagent discovery reviewed for Antigravity 2.0. The shared CLI harness does not make all legacy IDE settings equivalent.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".gemini/config/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".agent/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
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

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".gemini/config/mcp_config.json",
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
            path: ".agents/mcp_config.json",
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
            required: { name: "disabled", enabled: false, disabled: true },
            accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
          },
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
        notes:
          "Custom Markdown subagents are read by Antigravity 2.0 and the CLI. Authors supply native frontmatter; AXM preserves it and applies explicit agent overrides without translating tool names or changing execution-policy defaults.",
        docs: [{ label: "Custom subagents", url: "https://antigravity.google/docs/subagents/" }],
        sources: ["https://antigravity.google/docs/subagents/"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://antigravity.google/docs/subagents/"],
          conditions: [
            "Use Antigravity 2.0 or the Antigravity CLI with native name and description frontmatter; tool names, model, skills, plugins, and execution-policy settings must match the target harness.",
          ],
          limitations: [
            "Vendor execution of the generated subagent was not tested.",
            "AXM workspace setup currently supports project-scope Subagents; isolated user-scope adapter projection is checked but user-scope workspace installation remains unavailable.",
          ],
          claimScope: "Custom-subagent file discovery and native frontmatter contract.",
        },
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".gemini/config/agents",
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
        lastVerified: null,
        writer: null,
        verification: {
          verifiedAt: "2026-10-01",
          boundary: "configuration",
          evidence: ["specification:workspace/subagents/native-locations-respect-shape-and-proof"],
          limitations: [
            "Checks cover project and isolated user-scope file projection, shared ownership metadata, repetition, removal, and preservation of unowned files. They do not execute Antigravity.",
          ],
        },
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
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".gemini/config/hooks.json",
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
            path: ".agents/hooks.json",
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

        entryDialect: null,
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
        {
          scope: "project",
          root: "project",
          path: ".agents/rules",
          shape: "directory",
          role: "additional",
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
        "Antigravity CLI exposes fine-grained allow/ask/deny permissions in settings, with resources such as command(...), read_file(...), write_file(...), read_url(...), execute_url(...), and mcp(...).",
      docs: [],
      sources: [
        "https://antigravity.google/docs/cli-permissions",
        "https://antigravity.google/docs/cli-reference",
      ],
      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".gemini/antigravity-cli/settings.json",
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
            destination: { kind: "location", locationId: "user" },
            patch: {
              permissions: {
                allow: ["command(${tool})"],
              },
            },
            template: null,
          },
          filesystem: {
            destination: { kind: "location", locationId: "user" },
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
