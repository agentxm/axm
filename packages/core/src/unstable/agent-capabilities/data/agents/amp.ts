import type { Agent } from "../../schema.js";
export const ampAgent = {
  id: "amp",
  name: "Amp",
  vendor: "Sourcegraph",
  homepage: "https://ampcode.com",
  interfaces: ["cli", "ide-extension"],
  family: "sourcegraph",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Amp Owner's Manual",
      url: "https://ampcode.com/manual",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://ampcode.com/manual#agent-skills"],
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
        sources: ["https://ampcode.com/manual#subagents"],
        scopes: ["user", "project"],
        directory: ".agents/agents",
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
        sources: ["https://ampcode.com/manual#agentsmd"],
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Amp plugins can handle tool-call, tool-result, and agent lifecycle events. AXM models the in-process plugin surface but does not serialize Amp plugins or amp.hooks actions yet.",
        docs: [],
        sources: ["https://ampcode.com/manual", "https://ampcode.com/manual/plugin-api"],
        scopes: ["user", "project"],
        mechanism: ["in-process-plugin", "declarative-action"],
        configFiles: [],
        events: [
          {
            nativeName: "tool.call",
            canonical: "tool.pre",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://ampcode.com/manual", "https://ampcode.com/manual/plugin-api"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "tool.result",
            canonical: "tool.post",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["modify-output"] }],
            sources: ["https://ampcode.com/manual", "https://ampcode.com/manual/plugin-api"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "agent.start",
            canonical: "turn.start",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://ampcode.com/manual", "https://ampcode.com/manual/plugin-api"],
            lastVerified: "2026-06-06",
          },
        ],
      },
      canonical: {
        events: ["tool.pre", "tool.post", "turn.start"],
        mechanism: ["in-process-plugin", "declarative-action"],
        matcherKinds: ["none-imperative"],
        decision: [
          { kind: "observe" },
          { kind: "block", outcomes: ["allow", "deny"] },
          { kind: "modify", operations: ["modify-input", "modify-output", "inject-context"] },
        ],
      },
      axm: {
        support: "unsupported",
        reason: "AXM has not implemented Amp plugin or declarative-action hook writers.",
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
