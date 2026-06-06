import type { Agent } from "../../schema.js";
export const codebuddyAgent = {
  id: "codebuddy",
  name: "CodeBuddy",
  vendor: "Tencent Cloud",
  homepage: "https://www.codebuddy.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".codebuddy",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "CodeBuddy documentation",
      url: "https://www.codebuddy.ai/docs/ide/Introduction",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://www.codebuddy.ai/docs/ide/Introduction"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".codebuddy/skills",
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
        sources: ["https://staging-codebuddy.tencent.com/docs/cli/best-practices"],
        scopes: ["user", "project"],
        directory: ".codebuddy/agents",
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://staging-codebuddy.tencent.com/docs/cli/reference"],
      scopes: ["user", "project"],
      mechanism: ["cli-flag"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [
        {
          flag: "--dangerously-skip-permissions",
          note: "Bypasses CodeBuddy Code permission prompts.",
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
