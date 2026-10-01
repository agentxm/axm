import type { Agent } from "../../schema.js";
export const replitAgent = {
  id: "replit",
  name: "Replit",
  vendor: "Replit",
  homepage: "https://replit.com",
  interfaces: ["workspace-agent"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Replit Agent documentation",
      url: "https://docs.replit.com/replitai/agent",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Project skills are repository files. Team workspace skills are a separate centrally managed Workspace Settings surface, not a local user-home reader.",
        docs: [],
        sources: [
          "https://docs.replit.com/core-concepts/agent/skills",
          "https://docs.replit.com/features/agent/skills",
        ],
        scopes: ["project"],
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
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.replit.com/features/agent/skills"],
          conditions: ["Workspace skills are configured centrally in Workspace Settings."],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Project .agents/skills and workspace-managed skills",
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
          "Replit Agent MCP is UI-driven via the Integrations pane and 'Add to Replit' install-links, connecting only to remote HTTP servers (baseUrl + headers/OAuth). There is no AXM-writable MCP config file, so no writer dialect is modeled.",
        docs: [],
        sources: ["https://docs.replit.com/replitai/mcp/overview"],
        scopes: ["project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["http"],

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Replit Agent MCP is UI-managed (Integrations pane / install-links) with no AXM-writable config file.",
      },
    },
    subagent: {
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
        lastVerified: null,
        writer: null,
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
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
  permissions: {
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
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Replit",
      surface: "Replit Agent reading project files in its hosted workspace",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://docs.replit.com/features/agent/skills"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Project and workspace-managed skills",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
