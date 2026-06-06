import type { Agent } from "../../schema.js";
export const continueAgent = {
  id: "continue",
  name: "Continue",
  vendor: "Continue",
  homepage: "https://www.continue.dev",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".continue",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Continue documentation",
      url: "https://docs.continue.dev",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.continue.dev"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".continue/skills",
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
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.continue.dev/customize/deep-dives/prompt-files"],
        scopes: ["user", "project"],
        directory: ".continue/commands",
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
        notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
        docs: [],
        sources: ["https://docs.continue.dev/guides/configuring-models-rules-tools"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        kind: "rules-dir",
        files: ["*.md"],
        nestedDiscovery: false,
        importSyntax: null,
        directory: ".continue/rules",
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
