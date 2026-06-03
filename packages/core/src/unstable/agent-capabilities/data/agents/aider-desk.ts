import type { Agent } from "../../schema.js";

export const aiderDeskAgent = {
  id: "aider-desk",
  name: "AiderDesk",
  vendor: "HOTOVO",
  homepage: "https://github.com/hotovo/aider-desk",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".aider-desk",
  detection: {
    projectDirs: [".aider-desk"],
    userDirs: ["~/.aider-desk"],
  },
  docs: [
    {
      label: "AiderDesk repository",
      url: "https://github.com/hotovo/aider-desk",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: [
        "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        "https://github.com/hotovo/aider-desk/issues/568",
      ],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".aider-desk/skills",
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
