import type { Agent } from "../../schema.js";
export const codestudioAgent = {
  id: "codestudio",
  name: "Code Studio",
  vendor: "Syncfusion",
  homepage: "https://www.syncfusion.com/code-studio/",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".codestudio",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".codestudio", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.codestudio", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Code Studio documentation",
      url: "https://help.syncfusion.com/code-studio/welcome-to-code-studio",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://www.syncfusion.com/code-studio/features/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".codestudio/skills",
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
        notes: "Code Studio supports custom stdio and remote HTTP MCP servers.",
        docs: [],
        sources: [
          "https://www.syncfusion.com/code-studio/features/",
          "https://help.syncfusion.com/code-studio/reference/configure-properties/mcp/customservers",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http"],

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
        notes: "Code Studio custom agents are stored under .codestudio/agents.",
        docs: [],
        sources: [
          "https://www.syncfusion.com/code-studio/features/",
          "https://github.com/syncfusion/code-studio-library",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".codestudio/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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
          "Code Studio exposes command-based lifecycle hooks, but its public documentation does not enumerate a stable event and matcher grammar.",
        docs: [],
        sources: ["https://www.syncfusion.com/code-studio/features/"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,
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
        "The current Global Agent guide specifies lowercase agents.md at the workspace root, enabled with Agent Enabled and Use Agent MD File.",
      docs: [],
      sources: [
        "https://help.syncfusion.com/code-studio/features/globalagent",
        "https://www.syncfusion.com/code-studio/features/",
      ],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      kind: "own-file",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "agents.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "conditional",
            condition: "Enable Agent Enabled and Use Agent MD File in Code Studio.",
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
        sources: ["https://help.syncfusion.com/code-studio/features/globalagent"],
        conditions: ["Agent Enabled and Use Agent MD File must both be enabled."],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "Other Code Studio instruction surfaces were not reviewed.",
        ],
        claimScope: "Exact lowercase filename and opt-in requirements",
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
      product: "Code Studio",
      surface: "Code Studio editor agent",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://help.syncfusion.com/code-studio/features/globalagent"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, permissions.",
      ],
      claimScope: "Opt-in project instruction file",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
