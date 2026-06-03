import type { Agent } from "../../schema.js";

export const devinAgent = {
  id: "devin",
  name: "Devin for Terminal",
  vendor: "Cognition",
  homepage: "https://devin.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".devin",
  detection: {
    projectDirs: [".devin"],
    userDirs: ["$XDG_CONFIG_HOME/devin"],
  },
  docs: [
    {
      label: "Devin for Terminal skills",
      url: "https://cli.devin.ai/docs/extensibility/skills/overview",
    },
  ],
  skills: {
    lifecycle: "available",
    notes:
      "Devin also reads universal .agents/skills locations; AXM targets the native .devin/skills project path and XDG user path.\n",
    docs: [],
    sources: [
      "https://cli.devin.ai/docs/extensibility/skills/overview",
      "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
    ],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".devin/skills",
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
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://cli.devin.ai/docs/extensibility/rules-agents-md"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    kind: "agents-md",
    files: ["AGENTS.md"],
    nestedDiscovery: true,
    importSyntax: null,
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
