import type { Agent } from "../../schema.js";
export const openclawAgent = {
  id: "openclaw",
  name: "OpenClaw",
  vendor: "OpenClaw",
  homepage: "https://openclaw.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "OpenClaw documentation",
      url: "https://docs.openclaw.ai",
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
          "https://docs.openclaw.ai/tools/skills",
          "https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: "skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Resolve the configured OpenClaw agent workspace before selecting this path.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Resolve the configured OpenClaw agent workspace before selecting this path.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".openclaw/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Default OPENCLAW_STATE_DIR only; otherwise resolve the configured state directory.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Personal home skills are excluded when using a non-default state directory.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.openclaw.ai/tools/skills"],
          conditions: [
            "Project locations refer to the configured agent workspace, which need not be the current repository.",
          ],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Workspace, state-owned and personal skill discovery",
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
          "OpenClaw connects MCP servers through mcp.servers in its Gateway configuration. UI and CLI administration support stdio, Streamable HTTP and SSE; configured servers remain subject to tool policy. The default file is ~/.openclaw/openclaw.json (JSON5); resolve the active state/configuration path. JSON5 reader mechanics are not yet modeled in this catalog.",
        docs: [],
        sources: ["https://docs.openclaw.ai/tools/mcp"],

        scopes: ["user"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        entryDialect: null,
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.openclaw.ai/tools/mcp"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Exact entry grammar, secret handling and vendor runtime connectivity were not verified.",
          ],
          claimScope: "Native MCP client, transports and configuration key",
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
        notes:
          "Native sessions_spawn starts isolated background subagent runs with per-agent configuration and lifecycle tracking.",
        docs: [],
        sources: ["https://docs.openclaw.ai/tools/subagents"],

        scopes: [],
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.openclaw.ai/tools/subagents"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "No automatically discoverable custom-subagent directory or configuration scope was established.",
          ],
          claimScope:
            "Native sessions_spawn starts isolated background subagent runs with per-agent configuration and lifecycle tracking.",
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
          "Internal hooks use HOOK.md and a handler module; typed plugin hooks use api.on. Workspace hooks require explicit opt-in; HTTP ingress hooks are a separate feature.",
        docs: [],
        sources: ["https://docs.openclaw.ai/automation/hooks"],

        scopes: [],
        modeling: "native-unmodeled",
        entryDialect: null,
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.openclaw.ai/automation/hooks"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Event serialization and AXM writing remain unmodeled.",
          ],
          claimScope:
            "Internal hooks use HOOK.md and a handler module; typed plugin hooks use api.on. Workspace hooks require explicit opt-in; HTTP ingress hooks are a separate feature.",
        },
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "The configured agent workspace AGENTS.md is loaded at session start. Workspace location is explicit agent configuration and is not necessarily the current repository.",
      docs: [],
      sources: ["https://docs.openclaw.ai/concepts/agent-workspace"],

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
            kind: "conditional",
            condition: "Resolve the active OpenClaw agent workspace before selecting this path.",
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
        sources: ["https://docs.openclaw.ai/concepts/agent-workspace"],
        conditions: [],
        limitations: ["No vendor runtime or AXM writer execution was performed."],
        claimScope:
          "The configured agent workspace AGENTS.md is loaded at session start. Workspace location is explicit agent configuration and is not necessarily the current repository.",
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
        "Native tools.exec.mode controls host execution policy. Host-local approvals, session posture and delegated harness settings can impose additional restrictions.",
      docs: [],
      sources: ["https://docs.openclaw.ai/tools/permission-modes"],

      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://docs.openclaw.ai/tools/permission-modes"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope:
          "Native tools.exec.mode controls host execution policy. Host-local approvals, session posture and delegated harness settings can impose additional restrictions.",
      },
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "OpenClaw",
      surface: "OpenClaw Gateway agent with CLI and Control UI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://docs.openclaw.ai/tools/skills",
        "https://docs.openclaw.ai/tools/subagents",
        "https://docs.openclaw.ai/automation/hooks",
        "https://docs.openclaw.ai/tools/mcp",
        "https://docs.openclaw.ai/concepts/agent-workspace",
        "https://docs.openclaw.ai/tools/permission-modes",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
      ],
      claimScope: "Workspace skill scopes, hooks and subagent delegation",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
