import type { Agent } from "../../schema.js";

export const firebenderAgent = {
  id: "firebender",
  name: "Firebender",
  vendor: "Firebender",
  homepage: "https://firebender.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: null,
  detection: {
    projectDirs: [],
    userDirs: ["~/.firebender"],
  },
  docs: [
    {
      label: "Firebender documentation",
      url: "https://docs.firebender.com",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/vercel-labs/skills/blob/main/src/agents.ts"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      directory: ".agents/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
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
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
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
