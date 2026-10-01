import type { Agent } from "../../schema.js";
export const kodeAgent = {
  id: "kode",
  name: "Kode",
  vendor: "shareAI-lab",
  homepage: "https://github.com/shareAI-lab/Kode-CLI",
  interfaces: ["cli"],
  family: null,
  rootDir: ".kode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kode CLI repository",
      url: "https://github.com/shareAI-lab/Kode-CLI",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-CLI"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".kode/skills",
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
          "Kode connects to MCP servers via .mcp.json (mcpServers key) and .mcprc, managed with kode mcp add/list/get/remove; server tools are exposed as mcp__<server>__<tool>. Kode also supports a ws transport that is outside AXM's transport enum.",
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-CLI"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Native MCP config uses .mcp.json (mcpServers key), but the exact writer dialect is not documented; leaving the AXM MCP writer unbuilt pending an AXM product decision.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-CLI"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".kode/agents",
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
      notes:
        "Kode walks repository-root to working-directory instruction files, preferring AGENTS.override.md to AGENTS.md at a level; legacy CLAUDE.md remains readable. The default combined project document cap is 32 KiB.",
      docs: [],
      sources: ["https://github.com/shareAI-lab/Kode-CLI"],
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
        {
          scope: "project",
          root: "project",
          path: "AGENTS.override.md",
          shape: "file",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
      ],
      nestedDiscovery: true,
      importSyntax: null,

      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://github.com/shareAI-lab/Kode-CLI"],
        conditions: [],
        limitations: ["No vendor runtime or AXM writer execution was performed."],
        claimScope: "Repository-to-cwd AGENTS.md discovery and AGENTS.override.md precedence",
      },
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
      notes: null,
      docs: [],
      sources: ["https://github.com/shareAI-lab/Kode-CLI"],
      scopes: ["user", "project"],
      mechanism: ["cli-flag"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [
        {
          flag: "--safe",
          note: "Enables permission checks instead of Kode's default YOLO mode.",
        },
        {
          flag: "--dangerously-skip-permissions",
          note: "Explicitly bypasses permission checks.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Kode",
      surface: "Kode CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://github.com/shareAI-lab/Kode-CLI"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, permissions.",
      ],
      claimScope: "CLI product and AGENTS.md instruction discovery",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
