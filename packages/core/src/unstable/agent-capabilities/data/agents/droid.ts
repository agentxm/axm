import type { Agent } from "../../schema.js";
export const droidAgent = {
  id: "droid",
  name: "Droid",
  vendor: "Factory",
  homepage: "https://www.factory.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".factory",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Factory documentation",
      url: "https://docs.factory.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.factory.ai/cli/configuration/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".factory/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Factory documents legacy slash commands as still supported, while skills supersede them for new reusable workflows.\n",
        docs: [],
        sources: ["https://docs.factory.ai/cli/configuration/skills"],
        scopes: ["project"],
        directory: ".factory/commands",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
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
        sources: ["https://docs.factory.ai/cli/configuration/agents-md"],
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
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      canonical: {
        events: [],
        mechanism: [],
        matcherKinds: [],
        decision: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
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
