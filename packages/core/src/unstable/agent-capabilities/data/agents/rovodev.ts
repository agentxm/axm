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
    project: { markers: [{ kind: "dir", path: ".rovodev", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.rovodev", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Rovo Dev CLI skills",
      url: "https://support.atlassian.com/rovo/docs/extend-rovo-dev-cli-with-agent-skills/",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
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
      lifecycle: "supported",
      notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://support.atlassian.com/rovo/docs/use-subagents-in-rovo-dev-cli/"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".rovodev/agents",
      layout: "directory",
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
