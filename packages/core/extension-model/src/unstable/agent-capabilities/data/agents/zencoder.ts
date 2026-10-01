import type { Agent } from "../../schema.js";
export const zencoderAgent = {
  id: "zencoder",
  name: "Zencoder",
  vendor: "Zencoder",
  homepage: "https://zencoder.ai",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".zencoder",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Zencoder documentation",
      url: "https://docs.zencoder.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skills are discovered from project and user .agents/skills and project .claude/skills. Legacy .zencoder/skills remains readable but is deprecated; the agent selects skills automatically.",
        docs: [],
        sources: [
          "https://docs.zencoder.ai/llms-full.txt",
          "https://docs.zencoder.ai/features/skills",
        ],
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
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.zencoder.ai/features/skills"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Canonical shared skill roots and deprecated vendor directory",
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
        notes: null,
        docs: [],
        sources: ["https://docs.zencoder.ai/llms-full.txt"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM cannot yet model the dotted zencoder.mcpServers VS Code settings key, and the previous standalone .zencoder/mcp.json target was not vendor-documented.",
      },
    },
    subagent: {
      native: {
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Zencoder documents named AI agents configured and shared through its UI. This alone does not establish autonomous subagent delegation or a portable subagent directory.",
        docs: [],
        sources: ["https://docs.zencoder.ai/llms-full.txt"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has no delivery path for Zencoder's UI-managed custom agents.",
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
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://docs.zencoder.ai/llms-full.txt"],
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      locations: [
        {
          scope: "project",
          root: "project",
          path: ".zencoder/rules",
          shape: "directory",
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
        "Zencoder added MCP tool permission prompts in April 2026. The docs describe user-visible MCP permission control, not a stable AXM-writable permission file.",
      docs: [],
      sources: ["https://docs.zencoder.ai/llms-full.txt"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Zencoder permission grant writer.",
    },
  },

  profile: {
    identity: {
      product: "Zencoder",
      surface: "Zencoder IDE Agents",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://docs.zencoder.ai/features/skills"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Skill discovery and UI-managed agent distinction",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
