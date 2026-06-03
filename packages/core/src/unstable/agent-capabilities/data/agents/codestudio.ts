import type { Agent } from "../../schema.js";

export const codestudioAgent = {
  id: "codestudio",
  name: "Code Studio",
  vendor: "Code Studio",
  homepage: "https://sfcodestudio.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".codestudio",
  detection: {
    projectDirs: [".codestudio"],
    userDirs: ["~/.codestudio"],
  },
  docs: [
    {
      label: "Code Studio service terms",
      url: "https://downloads.sfcodestudio.com/sla/v1.0/code_studio_sla.pdf",
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
    convention: "vendor",
    directory: ".codestudio/skills",
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
