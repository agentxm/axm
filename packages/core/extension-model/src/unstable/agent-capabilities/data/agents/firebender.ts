import type { Agent } from "../../schema.js";
export const firebenderAgent = {
  id: "firebender",
  name: "Firebender",
  vendor: "Firebender",
  homepage: "https://firebender.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".firebender",
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        { kind: "dir", path: ".firebender", signal: "definitive", note: null },
        { kind: "file", path: "firebender.json", signal: "definitive", note: null },
      ],
    },
    user: { markers: [{ kind: "dir", path: "~/.firebender", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Firebender documentation",
      url: "https://docs.firebender.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.firebender.com/multi-agent/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".firebender/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".goose/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".codex/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".cursor/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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
          "Firebender stores MCP servers under mcpServers in firebender.json and ~/.firebender/firebender.json.",
        docs: [],
        sources: [
          "https://docs.firebender.com/context/mcp/overview",
          "https://firebendercorp.mintlify.app/api-reference/syntax",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: { variables: "braced", defaults: false },

        locations: [],

        entryDialect: null,
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
        notes:
          "Custom agent Markdown files must be listed in the agents array of firebender.json or ~/.firebender/firebender.json. A conventional directory alone does not register an agent.",
        docs: [],
        sources: ["https://docs.firebender.com/api-reference/agents"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".firebender/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Register each Markdown file in the agents array of firebender.json; the directory is not auto-discovered.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.firebender.com/api-reference/agents"],
          conditions: [
            "Paths are resolved relative to the applicable project or personal configuration.",
          ],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Explicit custom agent path registration",
        },
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
          "Firebender hooks execute commands with JSON event payloads on standard input and can observe, block, or modify selected operations.",
        docs: [],
        sources: ["https://docs.firebender.com/multi-agent/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".firebender/hooks.json",
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
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".firebender/hooks.json",
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
            nativeName: "sessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "preToolUse",
            canonical: "tool.pre",
            matcher: { kind: "literal-list", example: "Shell,Read,Write,MCP", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny", "ask"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "postToolUse",
            canonical: "tool.post",
            matcher: { kind: "literal-list", example: "Shell,Read,Write,MCP", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "subagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "preCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "Shell",
            canonical: "shell.exec",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "MCP",
            canonical: "mcp.call",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "afterFileEdit",
            canonical: "file.edit",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-08-05",
          },
        ],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Firebender reads .firebender/rules/*.mdc and also supports AGENTS.md; this entry models its primary vendor rule directory.",
      docs: [],
      sources: ["https://docs.firebender.com/multi-agent/global-rules"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      locations: [
        {
          scope: "project",
          root: "project",
          path: ".firebender/rules",
          shape: "directory",
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
      status: "unsupported",
      lastVerified: null,
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
      product: "Firebender",
      surface: "Firebender IDE agent",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://docs.firebender.com/api-reference/agents"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, hook, instructions, permissions.",
      ],
      claimScope: "Explicit registration of custom agent Markdown files",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
