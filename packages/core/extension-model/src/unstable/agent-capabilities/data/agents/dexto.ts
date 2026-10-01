import type { Agent } from "../../schema.js";
export const dextoAgent = {
  id: "dexto",
  name: "Dexto",
  vendor: "Truffle AI",
  homepage: "https://www.dexto.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.dexto", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Dexto documentation",
      url: "https://docs.dexto.ai",
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
          "https://github.com/truffle-ai/dexto/blob/main/packages/core/src/skills/workspace-skill-source.ts",
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
          "Dexto declares MCP servers under mcpServers in a project agent.yml. The vendor schema adds connectionMode and type fields around the standard server definitions.",
        docs: [],
        sources: ["https://docs.dexto.ai/mcp/"],
        scopes: ["project"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],

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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Dexto permissions use manual or auto-approve mode plus alwaysAllow and alwaysDeny tool policies in agent.yml.",
      docs: [],
      sources: [
        "https://github.com/truffle-ai/dexto/blob/main/docs/docs/guides/configuring-dexto/permissions.md",
      ],
      scopes: ["project"],
      mechanism: ["config-file", "cli-flag"],
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: "agent.yml",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "yaml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "mcp--filesystem--write_file",
        notes:
          "toolPolicies.alwaysAllow and toolPolicies.alwaysDeny contain tool identifiers such as read_file, bash_exec, and mcp--server--tool.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--auto-approve",
          note: "Enables auto-approve mode for the session.",
        },
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
      product: "Dexto",
      surface: "Dexto CLI profile; current documentation also describes Dexto Cloud",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://www.dexto.ai/docs/",
        "https://www.dexto.ai/docs/features/agents/",
        "https://www.dexto.ai/docs/features/skills/",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Current Cloud documentation does not reconfirm the historical CLI agent.yml or .agents/skills reader contracts.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope:
        "Cloud product and reusable agent profiles; historical CLI details are not reconfirmed",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
