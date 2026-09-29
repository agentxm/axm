import type { Agent } from "../../schema.js";
export const tabnineCliAgent = {
  id: "tabnine-cli",
  name: "Tabnine CLI",
  vendor: "Tabnine",
  homepage: "https://www.tabnine.com/platform-cli/",
  interfaces: ["cli"],
  family: null,
  rootDir: ".tabnine",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".tabnine", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.tabnine", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Tabnine CLI",
      url: "https://www.tabnine.com/platform-cli/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://docs.tabnine.com/main/getting-started/tabnine-cli/features/agent-skills",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".tabnine/agent/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
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
          "Tabnine MCP servers are configured in .tabnine/mcp_servers.json and ~/.tabnine/mcp_servers.json.",
        docs: [],
        sources: [
          "https://docs.tabnine.com/main/getting-started/tabnine-agent/mcp-intro-and-setup",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "universal",
        transports: ["stdio", "http", "sse"],

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
          "Tabnine hooks execute synchronously from layered agent settings and can observe, block, or modify selected lifecycle operations.",
        docs: [],
        sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".tabnine/agent/settings.json",
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
            path: ".tabnine/agent/settings.json",
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
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "BeforeAgent",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "AfterAgent",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "BeforeTool",
            canonical: "tool.pre",
            matcher: { kind: "literal-list", example: "shell,read,write", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "AfterTool",
            canonical: "tool.post",
            matcher: { kind: "literal-list", example: "shell,read,write", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompress",
            canonical: "compaction.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.tabnine.com/main/getting-started/tabnine-cli/features/hooks"],
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
      notes:
        "Tabnine reads guidelines.md files under .tabnine/guidelines and can override the context filename through settings.",
      docs: [],
      sources: ["https://docs.tabnine.com/main/getting-started/tabnine-agent/guidelines"],
      scopes: ["user", "project"],
      standardsCompliance: "parity",
      convention: "vendor",
      kind: "own-file",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "guidelines.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
        {
          scope: "project",
          root: "project",
          path: ".tabnine/guidelines",
          shape: "directory",
          role: "additional",
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Tabnine settings define allowed and excluded tools plus persistent-approval and policy-path controls.",
      docs: [],
      sources: [
        "https://docs.tabnine.com/main/getting-started/tabnine-cli/features/settings/settings-reference",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".tabnine/agent/settings.json",
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
          path: ".tabnine/agent/settings.json",
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
      grammar: {
        style: "glob",
        example: 'tools.allowed: ["shell"]',
        notes: "Allowed and excluded tool lists combine with security and policy-path settings.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
