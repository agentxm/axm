import type { Agent } from "../../schema.js";

export const deepagentsAgent = {
  id: "deepagents",
  name: "Deep Agents",
  vendor: "LangChain",
  homepage: "https://docs.langchain.com/oss/python/deepagents/overview",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  detection: {
    projectDirs: [],
    userDirs: ["~/.deepagents"],
  },
  docs: [
    {
      label: "Deep Agents skills documentation",
      url: "https://docs.langchain.com/oss/python/deepagents/skills",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes:
        "Deep Agents stores user skills under ~/.deepagents/<agent>/skills. The vercel-labs agent map uses the default agent path ~/.deepagents/agent/skills and the universal project directory.\n",
      docs: [],
      sources: [
        "https://docs.langchain.com/oss/python/deepagents/skills",
        "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
      ],
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
