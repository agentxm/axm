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
    projectDirs: [],
    userDirs: ["~/.dexto"],
  },
  docs: [
    {
      label: "Dexto",
      url: "https://www.dexto.ai",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://github.com/vercel-labs/skills/blob/main/src/agents.ts"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    directory: ".agents/skills",
  },
  commands: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  mcp: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  subagents: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  instructions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  rules: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  hooks: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
