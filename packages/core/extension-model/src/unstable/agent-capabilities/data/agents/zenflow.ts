import type { Agent } from "../../schema.js";
export const zenflowAgent = {
  id: "zenflow",
  name: "Zenflow",
  vendor: "Zencoder",
  homepage: "https://zencoder.ai/zenflow",
  interfaces: ["desktop"],
  family: null,
  rootDir: ".zenflow",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".zenflow", signal: "definitive", note: null }] },
    user: { markers: [] },
  },
  docs: [{ label: "Zenflow documentation", url: "https://docs.zencoder.ai/zenflow/task-types" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skills are discovered from project and user .agents/skills and project .claude/skills. Legacy .zencoder/skills remains readable but is deprecated; the agent selects skills automatically.",
        docs: [],
        sources: ["https://docs.zencoder.ai/features/skills"],
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
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".zencoder/skills",
            shape: "directory",
            role: "additional",
            status: "deprecated",
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
            path: ".agents/skills",
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
          sources: ["https://docs.zencoder.ai/features/skills"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Canonical shared skill roots and deprecated vendor directory",
        },
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Zenflow supports custom MCP integrations. The reviewed overview does not establish transport or filesystem configuration mechanics.",
        docs: [],
        sources: ["https://docs.zencoder.ai/zenflow/integrations"],

        scopes: [],
        modeling: "native-unmodeled",
        locations: [],
        entryDialect: null,
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.zencoder.ai/zenflow/integrations"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Transport, scope and client configuration details remain unmodeled.",
          ],
          claimScope: "Native MCP availability",
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
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "ZenCLI can invoke subprocess subagents with distinct contexts, models, tools and runtimes. Presets and pipelines configure orchestration without a portable agent directory.",
        docs: [],
        sources: ["https://docs.zencoder.ai/zenflow/subagents"],

        scopes: [],
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.zencoder.ai/zenflow/subagents"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "No automatically discoverable custom-subagent directory or configuration scope was established.",
          ],
          claimScope:
            "ZenCLI can invoke subprocess subagents with distinct contexts, models, tools and runtimes. Presets and pipelines configure orchestration without a portable agent directory.",
        },

        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM has not implemented a managed installation target for the documented native surface.",
      },
    },
    hook: {
      native: {
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", writer: null, lastVerified: null },
    },
  },
  instructions: {
    native: {
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Zenflow runs supported underlying agents in worktrees; instruction-file behavior belongs to the selected agent rather than a Zenflow-specific rule format. Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
      docs: [],
      sources: ["https://docs.zencoder.ai/clis/overview"],
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Saved agent presets select the coding runtime, model and permission mode, including execution and tool access.",
      docs: [],
      sources: ["https://docs.zencoder.ai/zenflow/orchestration/agent-presets"],

      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://docs.zencoder.ai/zenflow/orchestration/agent-presets"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope:
          "Saved agent presets select the coding runtime, model and permission mode, including execution and tool access.",
      },
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },

  profile: {
    identity: {
      product: "Zenflow",
      surface: "Zenflow orchestration and ZenCLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://docs.zencoder.ai/zenflow/subagents",
        "https://docs.zencoder.ai/features/skills",
        "https://docs.zencoder.ai/zenflow/integrations",
        "https://docs.zencoder.ai/zenflow/orchestration/agent-presets",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: hook, instructions.",
      ],
      claimScope: "Native subprocess delegation, MCP integrations and shared skills",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
