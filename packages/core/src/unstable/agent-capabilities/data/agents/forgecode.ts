import type { Agent } from "../../schema.js";
export const forgecodeAgent = {
  id: "forgecode",
  name: "ForgeCode",
  vendor: "Tailcall",
  homepage: "https://forgecode.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".forge",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".forge", signal: "definitive", note: null }] },
    user: {
      markers: [
        { kind: "dir", path: "~/.forge", signal: "definitive", note: null },
        { kind: "dir", path: "~/forge", signal: "definitive", note: null },
      ],
    },
  },
  docs: [
    {
      label: "ForgeCode skills documentation",
      url: "https://forgecode.dev/docs/skills/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "ForgeCode also reads shared ~/.agents/skills and documents ~/forge/skills as its global skills path; ~/.forge is retained as an install marker from vercel-labs/skills.\n",
        docs: [],
        sources: [
          "https://forgecode.dev/docs/skills/",
          "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".forge/skills",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://forgecode.dev/docs/agents-md/"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: false,
        importSyntax: null,
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
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
