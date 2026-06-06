import type { Agent } from "../../schema.js";
export const kodeAgent = {
  id: "kode",
  name: "Kode",
  vendor: "shareAI-lab",
  homepage: "https://github.com/shareAI-lab/Kode-Agent",
  interfaces: ["cli"],
  family: null,
  rootDir: ".kode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kode Agent repository",
      url: "https://github.com/shareAI-lab/Kode-Agent",
    },
  ],
  capabilities: {
    skill: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-Agent"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".kode/skills",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-Agent"],
        scopes: ["user", "project"],
        directory: ".kode/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
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
        sources: ["https://github.com/shareAI-lab/Kode-Agent"],
        scopes: ["project"],
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://github.com/shareAI-lab/Kode-Agent"],
      scopes: ["user", "project"],
      mechanism: ["cli-flag"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [
        {
          flag: "--safe",
          note: "Enables permission checks instead of Kode's default YOLO mode.",
        },
        {
          flag: "--dangerously-skip-permissions",
          note: "Explicitly bypasses permission checks.",
        },
      ],
    },
    axm: {
      support: "supported",
      lastVerified: "2026-05-20",
      writer: {
        grants: {},
      },
    },
  },
} as const satisfies Agent;
