import type { Agent } from "../../schema.js";

export const adalAgent = {
  id: "adal",
  name: "AdaL",
  vendor: "SylphAI",
  homepage: "https://adalagent.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".adal",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "AdaL documentation",
      url: "https://docs.sylph.ai",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.sylph.ai/features/plugins-and-skills"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".adal/skills",
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
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.sylph.ai/features/agent-context-and-agents-md"],
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
