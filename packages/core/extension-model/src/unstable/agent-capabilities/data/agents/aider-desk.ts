import type { Agent } from "../../schema.js";
export const aiderDeskAgent = {
  id: "aider-desk",
  name: "AiderDesk",
  vendor: "HOTOVO",
  homepage: "https://github.com/hotovo/aider-desk",
  interfaces: ["desktop"],
  family: null,
  rootDir: ".aider-desk",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".aider-desk", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.aider-desk", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "AiderDesk repository",
      url: "https://github.com/hotovo/aider-desk",
    },
    {
      label: "AiderDesk documentation",
      url: "https://aiderdesk.hotovo.com/docs",
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
          "https://aiderdesk.hotovo.com/docs/features/skills",
          "https://github.com/hotovo/aider-desk/issues/568",
          "https://aiderdesk.hotovo.com/docs/agent-mode/skills",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".aider-desk/skills",
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
            path: ".aider-desk/skills",
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
          sources: ["https://aiderdesk.hotovo.com/docs/agent-mode/skills"],
          conditions: ["The selected agent profile must enable Use Skills Tools."],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Project and home skills; Skills Tools must be enabled",
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
        notes:
          "AiderDesk is a native MCP client: it connects to external standard MCP servers and exposes their tools to the agent, registering only the servers listed in a profile's enabledServers. MCP client configuration lives under the .aider-desk config, but the exact config file path, servers key, and per-transport dialect are not documented, so no AXM writer is modeled. AiderDesk can additionally act as an MCP server via @aiderdesk/mcp-server (the inverse direction).",
        docs: [],
        sources: ["https://github.com/hotovo/aider-desk"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AiderDesk's MCP client config dialect (exact file path, servers key, and transport-specific shape under .aider-desk) is not documented, so AXM has no MCP writer.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "AiderDesk agent profiles can be enabled as subagents through Settings > Agent. They have isolated context, tool approvals and automatic or on-demand invocation.",
        docs: [],
        sources: ["https://aiderdesk.hotovo.com/docs/agent-mode/subagents"],

        scopes: [],
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://aiderdesk.hotovo.com/docs/agent-mode/subagents"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "No automatically discoverable custom-subagent directory or configuration scope was established.",
          ],
          claimScope:
            "AiderDesk agent profiles can be enabled as subagents through Settings > Agent. They have isolated context, tool approvals and automatic or on-demand invocation.",
        },

        modeling: "native-unmodeled",
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
          "AiderDesk has a native lifecycle hook / Extension System with 30+ events (onTaskCreated, onPromptFinished, onToolCalled, onFileAdded, ...) that can observe, modify, or block operations. Hooks are in-process JS/TS callbacks under .aider-desk/hooks/ (project) and ~/.aider-desk/hooks/ (user), with a newer Extension System under .aider-desk/extensions/. The native event names are not canonically mappable and there is no command-stdin dialect for AXM to serialize.",
        docs: [],
        sources: ["https://github.com/hotovo/aider-desk"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason:
          "AiderDesk hooks are in-process JS/TS callbacks with no command-stdin serialization dialect, and its 30+ native events are not canonically mapped, so AXM has no hook writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "The /init command creates an AGENTS.md project rule file.",
      docs: [],
      sources: ["https://aiderdesk.hotovo.com/docs/core/commands"],

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
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
      ],
      nestedDiscovery: false,
      importSyntax: null,
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://aiderdesk.hotovo.com/docs/core/commands"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "Global rule locations and nested instruction discovery were not established.",
        ],
        claimScope: "The /init command creates an AGENTS.md project rule file.",
      },
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
        "Agent profiles configure tool groups and per-tool Ask, Always or Never approval policies.",
      docs: [],
      sources: ["https://aiderdesk.hotovo.com/docs/agent-mode/subagents"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],

      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://aiderdesk.hotovo.com/docs/agent-mode/subagents"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope:
          "Agent profiles configure tool groups and per-tool Ask, Always or Never approval policies.",
      },
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason:
        "AXM has not implemented a managed installation target for the documented native surface.",
    },
  },

  profile: {
    identity: {
      product: "AiderDesk",
      surface: "AiderDesk desktop Agent mode",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://aiderdesk.hotovo.com/docs/agent-mode/subagents",
        "https://aiderdesk.hotovo.com/docs/agent-mode/skills",
        "https://aiderdesk.hotovo.com/docs/core/commands",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, hook.",
      ],
      claimScope: "UI-managed subagent profiles and per-tool approvals",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
