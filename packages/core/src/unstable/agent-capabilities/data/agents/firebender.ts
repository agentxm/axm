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
        directory: ".firebender/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Firebender custom commands live under .firebender/commands; the firebender.json commands key is deprecated in favor of command files and agents.",
        docs: [],
        sources: ["https://firebendercorp.mintlify.app/api-reference/syntax"],
        scopes: ["user", "project"],
        directory: ".firebender/commands",
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
        notes: "Firebender subagents are Markdown definitions under .firebender/agents.",
        docs: [],
        sources: ["https://docs.firebender.com/api-reference/agents"],
        scopes: ["user", "project"],
        directory: ".firebender/agents",
        layout: "file",
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
        configFiles: [
          {
            scope: "project",
            path: ".firebender/hooks.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "user",
            path: "~/.firebender/hooks.json",
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
            lastVerified: "2026-07-22",
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
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "postToolUse",
            canonical: "tool.post",
            matcher: { kind: "literal-list", example: "Shell,Read,Write,MCP", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "subagentStop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "preCompact",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
        ],
        tools: [
          {
            nativeName: "Shell",
            canonical: "shell.exec",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "MCP",
            canonical: "mcp.call",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "afterFileEdit",
            canonical: "file.edit",
            sources: ["https://docs.firebender.com/multi-agent/hooks"],
            lastVerified: "2026-07-22",
          },
        ],
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
      directory: ".firebender/rules",
      files: ["*.mdc"],
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
