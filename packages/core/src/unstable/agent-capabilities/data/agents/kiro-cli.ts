import type { Agent } from "../../schema.js";
export const kiroCliAgent = {
  id: "kiro-cli",
  name: "Kiro CLI",
  vendor: "AWS",
  homepage: "https://kiro.dev",
  interfaces: ["cli"],
  family: "amazon",
  rootDir: ".kiro",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kiro CLI documentation",
      url: "https://kiro.dev/docs/cli/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kiro.dev/docs/cli/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".kiro/skills",
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
        sources: ["https://kiro.dev/docs/cli/"],
        scopes: ["user", "project"],
        directory: ".kiro/prompts",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kiro.dev/docs/cli/mcp/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: ".kiro/settings/mcp.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.kiro/settings/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                name: "type",
                value: {
                  "streamable-http": "http",
                  sse: "http",
                },
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: null,
            },
            transform: null,
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://kiro.dev/docs/cli/custom-agents/configuration-reference/"],
        scopes: ["user", "project"],
        directory: ".kiro/agents",
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
        sources: ["https://kiro.dev/docs/cli/steering/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".kiro/steering",
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
          "Kiro CLI hooks are command hooks in agent configuration. AXM models the surface but does not serialize Kiro CLI hooks yet.",
        docs: [],
        sources: [
          "https://kiro.dev/docs/cli/hooks/",
          "https://kiro.dev/docs/cli/custom-agents/configuration-reference/",
        ],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [],
        events: [
          {
            nativeName: "agentSpawn",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://kiro.dev/docs/cli/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "userPromptSubmit",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://kiro.dev/docs/cli/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "preToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "literal-list",
              example: "execute_bash",
              notes: "Supports canonical tool names, aliases, MCP server prefixes, and *.",
            },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://kiro.dev/docs/cli/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "postToolUse",
            canonical: "tool.post",
            matcher: {
              kind: "literal-list",
              example: "fs_write",
              notes: "Supports canonical tool names, aliases, MCP server prefixes, and *.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://kiro.dev/docs/cli/hooks/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "stop",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://kiro.dev/docs/cli/hooks/"],
            lastVerified: "2026-06-06",
          },
        ],
      },
      canonical: {
        events: ["session.start", "prompt.submit", "tool.pre", "tool.post", "turn.end"],
        mechanism: ["command-stdin"],
        matcherKinds: ["literal-list", "none-imperative"],
        decision: [
          { kind: "observe" },
          { kind: "block", outcomes: ["allow", "deny"] },
          { kind: "modify", operations: ["inject-context"] },
        ],
      },
      axm: {
        support: "unsupported",
        reason: "AXM has not implemented a Kiro CLI hooks writer.",
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
