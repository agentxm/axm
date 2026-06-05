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
    project: { markers: [{ kind: "dir", path: ".codemaker", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.codemaker", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Codemaker documentation",
      url: "https://docs.codemaker.ai",
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
      convention: "vendor",
      directory: ".codemaker/skills",
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
