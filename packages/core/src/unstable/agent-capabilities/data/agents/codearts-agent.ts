import type { Agent } from "../../schema.js";

export const codeartsAgentAgent = {
  id: "codearts-agent",
  name: "CodeArts Agent",
  vendor: "Huawei Cloud",
  homepage: "https://www.huaweicloud.com/intl/en-us/product/codearts.html",
  interfaces: ["cli"],
  family: null,
  rootDir: ".codeartsdoer",
  detection: {
    projectDirs: [".codeartsdoer"],
    userDirs: ["~/.codeartsdoer"],
  },
  docs: [
    {
      label: "Huawei CodeArts",
      url: "https://www.huaweicloud.com/intl/en-us/product/codearts.html",
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
    directory: ".codeartsdoer/skills",
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
