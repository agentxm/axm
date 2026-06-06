import type { Agent } from "../../schema.js";
export const grokCliAgent = {
  id: "grok-cli",
  name: "Grok CLI",
  vendor: "xAI",
  homepage: "https://x.ai/cli",
  interfaces: ["cli"],
  family: "xai",
  rootDir: ".grok",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Grok CLI documentation",
      url: "https://docs.x.ai/build/overview",
    },
  ],
  capabilities: {
    skill: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Reads SKILL.md Agent Skills from project (.grok/skills) and user (~/.grok/skills, ~/.agents/skills) locations, plus additional paths configured via [skills] in ~/.grok/config.toml.\n",
        docs: [],
        sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".grok/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-19",
        writer: null,
      },
    },
    command: {
      canonical: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    "mcp-server": {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "MCP servers are managed with `grok mcp add/remove/list` or under the mcpServers key in .grok/settings.json. The prescriptive config dialect has not been verified against xAI docs.\n",
        docs: [],
        sources: ["https://docs.x.ai/build/modes-and-commands"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-19",
        writer: null,
      },
    },
    subagent: {
      canonical: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    files: {
      canonical: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    rule: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "AGENTS.md files are merged from the git root down to the working directory, with AGENTS.override.md taking precedence per directory.\n",
        docs: [],
        sources: ["https://docs.x.ai/build/overview"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-19",
        writer: null,
      },
    },
    hook: {
      canonical: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
  },
  permissions: {
    canonical: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: {
      support: "unsupported",
      writer: null,
    },
  },
} as const satisfies Agent;
