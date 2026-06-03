import type { Agent } from "../../schema.js";

export const codemakerAgent = {
  id: "codemaker",
  name: "Codemaker",
  vendor: "CodeMaker AI",
  homepage: "https://codemaker.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".codemaker",
  detection: {
    projectDirs: [".codemaker"],
    userDirs: ["~/.codemaker"],
  },
  docs: [
    {
      label: "Codemaker documentation",
      url: "https://docs.codemaker.ai",
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
    directory: ".codemaker/skills",
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
