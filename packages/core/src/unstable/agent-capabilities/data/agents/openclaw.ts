import type { Agent } from "../../schema.js";

export const openclawAgent = {
  id: "openclaw",
  name: "OpenClaw",
  vendor: "OpenClaw",
  homepage: "https://openclaw.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: null,
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "OpenClaw documentation",
      url: "https://docs.openclaw.ai",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: [
      "https://docs.openclaw.ai/skills",
      "https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md",
    ],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: "skills",
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
