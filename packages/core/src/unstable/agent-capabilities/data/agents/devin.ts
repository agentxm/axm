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
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Devin also reads universal .agents/skills locations; AXM targets the native .devin/skills project path and XDG user path.\n",
        docs: [],
        sources: [
          "https://cli.devin.ai/docs/extensibility/skills/overview",
          "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".devin/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    command: {
      canonical: {
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
      canonical: {
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
      canonical: {
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
    files: {
      canonical: {
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
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://cli.devin.ai/docs/extensibility/rules-agents-md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    hook: {
      canonical: {
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
  },
  permissions: {
    canonical: {
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
