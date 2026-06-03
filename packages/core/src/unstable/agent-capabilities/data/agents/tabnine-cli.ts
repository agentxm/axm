import type { Agent } from "../../schema.js";

export const tabnineCliAgent = {
  id: "tabnine-cli",
  name: "Tabnine CLI",
  vendor: "Tabnine",
  homepage: "https://www.tabnine.com/platform-cli/",
  interfaces: ["cli"],
  family: null,
  rootDir: ".tabnine",
  detection: {
    projectDirs: [".tabnine"],
    userDirs: ["~/.tabnine"],
  },
  docs: [
    {
      label: "Tabnine CLI",
      url: "https://www.tabnine.com/platform-cli/",
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
    directory: ".tabnine/agent/skills",
  },
  commands: {
    lifecycle: "available",
    notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/commands"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".tabnine/agent/commands",
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
