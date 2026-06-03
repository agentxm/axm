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
      directory: ".codestudio/skills",
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
