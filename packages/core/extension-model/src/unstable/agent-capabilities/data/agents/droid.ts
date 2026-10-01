import type { Agent } from "../../schema.js";
export const droidAgent = {
  id: "droid",
  name: "Droid",
  vendor: "Factory",
  homepage: "https://www.factory.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".factory",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Factory documentation",
      url: "https://docs.factory.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.factory.ai/cli/configuration/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".factory/skills",
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
        notes: "Factory MCP configuration supports local and remote servers.",
        docs: [],
        sources: ["https://docs.factory.ai/cli/configuration/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: { variables: "braced", defaults: true },

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Factory custom droids are Markdown files under .factory/droids.",
        docs: [],
        sources: [
          "https://docs.factory.ai/cli/configuration/custom-droids",
          "https://docs.factory.ai/harness/subagents",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".factory/droids",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".factory/droids",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.factory.ai/harness/subagents"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Subagents do not spawn further subagents or use AskUser.",
          ],
          claimScope: "Custom droids and builtin delegation boundaries",
        },
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
          "Factory prefers .factory/hooks.json and ~/.factory/hooks.json with an unwrapped event map. The hooks key in settings files is a fallback; older .factory/hooks/hooks.json is a migration source.",
        docs: [],
        sources: [
          "https://docs.factory.ai/cli/configuration/hooks-guide",
          "https://docs.factory.ai/harness/hooks",
        ],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".factory/hooks.json",
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
            keyPath: [],
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".factory/hooks.json",
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
            keyPath: [],
          },
          {
            scope: "user",
            root: "home",
            path: ".factory/settings.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            id: "user-settings",
            format: "json",
            keyPath: [],
            attribution: "agent",
          },
          {
            scope: "project",
            root: "project",
            path: ".factory/settings.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            id: "project-settings",
            format: "json",
            keyPath: [],
            attribution: "agent",
          },
          {
            scope: "project",
            root: "project",
            path: ".factory/settings.local.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            id: "project-local-settings",
            format: "json",
            keyPath: [],
            attribution: "agent",
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Execute|Create|Edit|ApplyPatch", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["deny"] }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Execute|Create|Edit|ApplyPatch", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "Execute",
            canonical: "shell.exec",
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Create",
            canonical: "file.write",
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "ApplyPatch",
            canonical: "file.edit",
            sources: ["https://docs.factory.ai/cli/configuration/hooks-guide"],
            lastVerified: "2026-08-05",
          },
        ],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.factory.ai/harness/hooks"],
          conditions: [
            "Canonical hooks.json uses an unwrapped event map; settings.json wraps entries in hooks.",
          ],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Existing event mappings are not an exhaustive review of every hook event.",
          ],
          claimScope: "Canonical hooks.json files and settings-file fallback",
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://docs.factory.ai/cli/configuration/agents-md"],
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
        "Factory layers command allow, deny, and block lists; blocklist rules take precedence over denylist and allowlist rules.",
      docs: [],
      sources: [
        "https://docs.factory.ai/cli/configuration/settings",
        "https://docs.factory.ai/cli/droid-exec/overview",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".factory/settings.json",
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
          path: ".factory/settings.json",
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
        style: "prefix",
        example: 'commandAllowlist: ["git status", "ls"]',
        notes:
          "Command-prefix allow, deny, and block lists are matched after program resolution to prevent path-based bypasses.",
      },
      prerequisites: [],
      cliFlags: [
        { flag: "--auto <low|medium|high>", note: "Selects the automation level." },
        { flag: "--skip-permissions-unsafe", note: "Bypasses permission checks." },
        { flag: "--enabled-tools <ids>", note: "Restricts the enabled tool set." },
        { flag: "--disabled-tools <ids>", note: "Disables selected tools." },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Droid",
      surface: "Factory Droid shared harness; CLI configuration",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://docs.factory.ai/harness/hooks",
        "https://docs.factory.ai/harness/subagents",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, instructions, permissions.",
      ],
      claimScope: "Hook configuration and custom droids",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
