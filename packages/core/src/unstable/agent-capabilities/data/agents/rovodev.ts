import type { Agent } from "../../schema.js";

export const rovodevAgent = {
  id: "rovodev",
  name: "Rovo Dev",
  vendor: "Atlassian",
  homepage: "https://www.atlassian.com/software/rovo-dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".rovodev",
  detection: {
    projectDirs: [".rovodev"],
    userDirs: ["~/.rovodev"],
  },
  docs: [
    {
      label: "Rovo Dev CLI skills",
      url: "https://support.atlassian.com/rovo/docs/extend-rovo-dev-cli-with-agent-skills/",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: "Rovo Dev also reads universal .agents/skills in both project and user scopes.\n",
    docs: [],
    sources: [
      "https://support.atlassian.com/rovo/docs/extend-rovo-dev-cli-with-agent-skills/",
      "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
    ],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".rovodev/skills",
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
    lifecycle: "available",
    notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://support.atlassian.com/rovo/docs/use-subagents-in-rovo-dev-cli/"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".rovodev/agents",
    layout: "directory",
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
