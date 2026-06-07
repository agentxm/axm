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
      native: {
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
