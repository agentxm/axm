import type { Agent } from "../../schema.js";

export const codeartsAgentAgent = {
  id: "codearts-agent",
  name: "CodeArts Agent",
  vendor: "Huawei Cloud",
  homepage: "https://www.huaweicloud.com/intl/en-us/product/codearts.html",
  interfaces: ["cli"],
  family: null,
  rootDir: ".codeartsdoer",
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [{ kind: "dir", path: ".codeartsdoer", signal: "definitive", note: null }],
    },
    user: { markers: [{ kind: "dir", path: "~/.codeartsdoer", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Huawei CodeArts",
      url: "https://www.huaweicloud.com/intl/en-us/product/codearts.html",
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
      directory: ".codeartsdoer/skills",
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
