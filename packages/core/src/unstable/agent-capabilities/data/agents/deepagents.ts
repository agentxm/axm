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
  skills: {
    lifecycle: "available",
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
