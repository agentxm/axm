import type { Agent } from "../../schema.js";
export const deepagentsAgent = {
  id: "deepagents",
  name: "Deep Agents",
  vendor: "LangChain",
  homepage: "https://docs.langchain.com/oss/python/deepagents/overview",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.deepagents", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Deep Agents skills documentation",
      url: "https://docs.langchain.com/oss/python/deepagents/skills",
    },
  ],
  capabilities: {
    skill: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Deep Agents stores user skills under ~/.deepagents/<agent>/skills. The vercel-labs agent map uses the default agent path ~/.deepagents/agent/skills and the universal project directory.\n",
        docs: [],
        sources: [
          "https://docs.langchain.com/oss/python/deepagents/skills",
          "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
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
