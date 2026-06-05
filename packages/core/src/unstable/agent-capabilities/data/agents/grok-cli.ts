import type { Agent } from "../../schema.js";

export const grokCliAgent = {
  id: "grok-cli",
  name: "Grok CLI",
  vendor: "xAI",
  homepage: "https://x.ai/cli",
  interfaces: ["cli"],
  family: "xai",
  rootDir: ".grok",
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
      lifecycle: "supported",
      notes:
        "Reads SKILL.md Agent Skills from project (.grok/skills) and user (~/.grok/skills, ~/.agents/skills) locations, plus additional paths configured via [skills] in ~/.grok/config.toml.\n",
      docs: [],
      sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
      lastVerified: "2026-05-19",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".grok/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    "mcp-server": {
      lifecycle: "supported",
      notes:
        "MCP servers are managed with `grok mcp add/remove/list` or under the mcpServers key in .grok/settings.json. The prescriptive config dialect has not been verified against xAI docs.\n",
      docs: [],
      sources: ["https://docs.x.ai/build/modes-and-commands"],
      lastVerified: "2026-05-19",
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      transports: ["stdio", "http", "sse"],
    },
    subagent: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    files: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      lifecycle: "supported",
      notes:
        "AGENTS.md files are merged from the git root down to the working directory, with AGENTS.override.md taking precedence per directory.\n",
      docs: [],
      sources: ["https://docs.x.ai/build/overview"],
      lastVerified: "2026-05-19",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    hook: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
