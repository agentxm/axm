import type { Agent } from "../../schema.js";
export const cortexAgent = {
  id: "cortex",
  name: "Snowflake CoCo",
  vendor: "Snowflake",
  homepage: "https://www.snowflake.com/en/product/features/cortex-code",
  interfaces: ["cli"],
  family: null,
  rootDir: ".cortex",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".cortex", signal: "definitive", note: null }] },
    user: {
      markers: [{ kind: "dir", path: "~/.snowflake/cortex", signal: "definitive", note: null }],
    },
  },
  docs: [
    {
      label: "Cortex Code CLI extensibility",
      url: "https://docs.snowflake.com/en/user-guide/cortex-code/extensibility",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://docs.snowflake.com/en/user-guide/cortex-code/extensibility",
          "https://github.com/Snowflake-Labs/coco-skills",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".cortex/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Detailed existing CLI paths and serialization were not revalidated by this overview.",
          ],
          claimScope: "Capability availability and CLI/Desktop/Snowsight boundaries",
        },
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
        notes: "Cortex Code configures MCP servers under the mcpServers key.",
        docs: [],
        sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: { variables: "braced", defaults: false },

        locations: [],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Detailed existing CLI paths and serialization were not revalidated by this overview.",
          ],
          claimScope: "Capability availability and CLI/Desktop/Snowsight boundaries",
        },
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
        notes: "Cortex Code subagents are Markdown definitions under .cortex/agents.",
        docs: [],
        sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".cortex/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Detailed existing CLI paths and serialization were not revalidated by this overview.",
          ],
          claimScope: "Capability availability and CLI/Desktop/Snowsight boundaries",
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
        notes: "Cortex Code hooks execute commands with event data on standard input.",
        docs: [],
        sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".snowflake/cortex/hooks.json",
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
            path: ".cortex/settings.json",
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
            path: ".cortex/settings.local.json",
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
        ],
        events: [
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "Bash|Write|Edit", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny", "ask"] }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "Bash|Write|Edit", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Detailed existing CLI paths and serialization were not revalidated by this overview.",
          ],
          claimScope: "Capability availability and CLI/Desktop/Snowsight boundaries",
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
      notes: "Cortex Code loads AGENTS.md instruction files.",
      docs: [],
      sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
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
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Cortex Code permission rules are stored in permissions.json and layered settings files.",
      docs: [],
      sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".snowflake/cortex/permissions.json",
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
          id: "user-additional-1",
          scope: "user",
          root: "home",
          path: ".snowflake/cortex/settings.json",
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
          gitignored: false,
        },
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".cortex/settings.json",
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
        example: "Bash(git status)",
        notes: "Permission allow and deny entries match tool calls and command prefixes.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Snowflake CoCo",
      surface: "Snowflake CoCo CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://docs.snowflake.com/en/user-guide/cortex-code/extensibility"],
      conditions: [
        "This profile models CLI paths. Desktop shares the user configuration root but has distinct workspace paths; Snowsight uses hosted Horizon Catalog skills.",
      ],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: instructions, permissions.",
      ],
      claimScope: "Product naming and CLI/Desktop/Snowsight extensibility boundaries",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
