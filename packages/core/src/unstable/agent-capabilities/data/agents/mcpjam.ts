import type { Agent } from "../../schema.js";

export const mcpjamAgent = {
  id: "mcpjam",
  name: "MCPJam",
  vendor: "MCPJam",
  homepage: "https://www.mcpjam.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".mcpjam",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "MCPJam Inspector documentation",
      url: "https://docs.mcpjam.com",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.mcpjam.com/inspector/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".mcpjam/skills",
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
