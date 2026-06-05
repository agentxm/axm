import type { Agent } from "../../schema.js";

export const dextoAgent = {
  id: "dexto",
  name: "Dexto",
  vendor: "Dexto",
  homepage: "https://www.dexto.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.dexto", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Dexto",
      url: "https://www.dexto.ai",
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
