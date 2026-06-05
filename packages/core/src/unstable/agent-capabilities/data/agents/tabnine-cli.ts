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
    project: { markers: [{ kind: "dir", path: ".tabnine", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.tabnine", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Tabnine CLI",
      url: "https://www.tabnine.com/platform-cli/",
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
      directory: ".tabnine/agent/skills",
    },
    command: {
      lifecycle: "supported",
      notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/commands"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".tabnine/agent/commands",
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
