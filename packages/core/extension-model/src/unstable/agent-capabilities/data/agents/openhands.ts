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
        notes: null,
        docs: [],
        sources: ["https://docs.openhands.dev/overview/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".openhands/skills",
            shape: "directory",
            role: "additional",
            status: "deprecated",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".openhands/microagents",
            shape: "directory",
            role: "additional",
            status: "deprecated",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.openhands.dev/overview/skills"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Canonical .agents/skills and legacy .openhands skill roots",
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
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

        locations: [],

        entryDialect: null,
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
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".openhands/hooks.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
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
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: { kind: "literal-list", example: "terminal", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-08-05",
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
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.openhands.dev/openhands/usage/customization/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [],

        entryDialect: null,
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
      locations: [
        {
          scope: "project",
          root: "project",
          path: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "OpenHands",
      surface: "OpenHands agent; reviewed skill contract",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://docs.openhands.dev/overview/skills"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Canonical and legacy skill paths",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
