import type { Agent } from "../../schema.js";

export const clineAgent = {
  id: "cline",
  name: "Cline",
  vendor: "Cline",
  homepage: "https://cline.bot",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".cline",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Cline documentation",
      url: "https://docs.cline.bot",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.cline.bot/customization/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".cline/skills",
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
    lifecycle: "available",
    notes: "No industry spec for rule files yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://docs.cline.bot/customization/cline-rules"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".clinerules",
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
