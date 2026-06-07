import type { Agent } from "../../schema.js";
export const rovodevAgent = {
  id: "rovodev",
  name: "Rovo Dev",
  vendor: "Atlassian",
  homepage: "https://www.atlassian.com/software/rovo-dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".rovodev",
  lifecycle: { state: "active" },
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
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Rovo Dev also reads universal .agents/skills in both project and user scopes.\n",
        docs: [],
        sources: [
          "https://support.atlassian.com/rovo/docs/extend-rovo-dev-cli-with-agent-skills/",
          "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".rovodev/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://support.atlassian.com/rovo/docs/use-subagents-in-rovo-dev-cli/"],
        scopes: ["user", "project"],
        directory: ".rovodev/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    files: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    rule: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        writer: null,
        verified: null,
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: {
      support: "unsupported",
      writer: null,
    },
  },
} as const satisfies Agent;
