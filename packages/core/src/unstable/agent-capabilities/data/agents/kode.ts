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
        status: "supported",
        lastVerified: "2026-06-06",
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
        status: "unsupported",
        lastVerified: null,
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
        status: "unsupported",
        lastVerified: null,
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
        status: "supported",
        lastVerified: "2026-06-06",
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
        status: "unsupported",
        lastVerified: null,
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
        status: "supported",
        lastVerified: "2026-06-06",
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
        status: "unsupported",
        writer: null,
        lastVerified: null,
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
      status: "supported",
      lastVerified: "2026-06-06",
      writer: {
        grants: {},
      },
    },
  },
} as const satisfies Agent;
