import type { Agent } from "../../schema.js";
export const openhandsAgent = {
  id: "openhands",
  name: "OpenHands",
  vendor: "All Hands AI",
  homepage: "https://www.openhands.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".openhands",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "OpenHands documentation",
      url: "https://docs.openhands.dev",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "OpenHands reads Agent Skills from .agents/skills and ~/.agents/skills; .openhands/skills remains a deprecated compatibility path.",
        docs: [],
        sources: ["https://docs.openhands.dev/overview/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "OpenHands stores MCP servers under mcpServers in ~/.openhands/mcp.json and manages them through the openhands mcp CLI.",
        docs: [],
        sources: [
          "https://docs.openhands.dev/sdk/guides/mcp",
          "https://docs.openhands.dev/openhands/usage/cli/mcp-servers",
        ],
        scopes: ["user"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented an OpenHands MCP writer.",
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
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "OpenHands lifecycle hooks are shell commands receiving JSON event payloads on stdin. Blocking events can deny with exit code 2 or a JSON decision; several events can inject additional context.",
        docs: [],
        sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
        scopes: ["project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "project",
            path: ".openhands/hooks.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: { kind: "literal-list", example: "terminal", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "literal-list", example: "terminal", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["inject-context"] },
            ],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-07-22",
          },
        ],
        tools: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://docs.openhands.dev/overview/skills"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: null,
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
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
