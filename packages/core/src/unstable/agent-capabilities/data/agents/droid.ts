import type { Agent } from "../../schema.js";

export const droidAgent = {
  id: "droid",
  name: "Droid",
  vendor: "Factory",
  homepage: "https://www.factory.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".factory",
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Factory documentation",
      url: "https://docs.factory.ai",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.factory.ai/cli/configuration/skills"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".factory/skills",
    },
    command: {
      lifecycle: "supported",
      notes:
        "Factory documents legacy slash commands as still supported, while skills supersede them for new reusable workflows.\n",
      docs: [],
      sources: ["https://docs.factory.ai/cli/configuration/skills"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      directory: ".factory/commands",
    },
    "mcp-server": {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
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
      notes: null,
      docs: [],
      sources: ["https://docs.factory.ai/cli/configuration/agents-md"],
      lastVerified: "2026-05-20",
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
