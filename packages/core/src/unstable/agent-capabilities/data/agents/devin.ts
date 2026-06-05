import type { Agent } from "../../schema.js";

export const devinAgent = {
  id: "devin",
  name: "Devin for Terminal",
  vendor: "Cognition",
  homepage: "https://devin.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".devin",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".devin", signal: "definitive", note: null }] },
    user: {
      markers: [{ kind: "dir", path: "$XDG_CONFIG_HOME/devin", signal: "definitive", note: null }],
    },
  },
  docs: [
    {
      label: "Devin for Terminal skills",
      url: "https://cli.devin.ai/docs/extensibility/skills/overview",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
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
      lifecycle: "supported",
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
