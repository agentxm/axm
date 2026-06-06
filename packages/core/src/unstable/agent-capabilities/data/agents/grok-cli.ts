import type { Agent } from "../../schema.js";
export const grokCliAgent = {
  id: "grok-cli",
  name: "Grok CLI",
  vendor: "xAI",
  homepage: "https://x.ai/cli",
  interfaces: ["cli"],
  family: "xai",
  rootDir: ".grok",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Grok CLI documentation",
      url: "https://docs.x.ai/build/overview",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Reads SKILL.md Agent Skills from project (.grok/skills) and user (~/.grok/skills, ~/.agents/skills) locations, plus additional paths configured via [skills] in ~/.grok/config.toml.\n",
        docs: [],
        sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".grok/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-19",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "MCP servers are managed with `grok mcp add/remove/list` or under the mcpServers key in .grok/settings.json. The prescriptive config dialect has not been verified against xAI docs.\n",
        docs: [],
        sources: ["https://docs.x.ai/build/modes-and-commands"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-19",
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
        notes:
          "AGENTS.md files are merged from the git root down to the working directory, with AGENTS.override.md taking precedence per directory.\n",
        docs: [],
        sources: ["https://docs.x.ai/build/overview"],
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
        lastVerified: "2026-05-19",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "xAI Grok CLI discovers hook scripts from .grok hooks paths and also advertises Claude Code hook compatibility. Exact in-app hook event details should be reverified before adding a writer.",
        docs: [],
        sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
        scopes: ["user", "project"],
        mechanism: ["command-env", "command-stdin"],
        configFiles: [],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "Write|Edit|Bash",
              notes: "Via Claude Code compatibility.",
            },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny", "ask"] }],
            sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: {
              kind: "regex",
              example: "Write|Edit|Bash",
              notes: "Via Claude Code compatibility.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Via Claude Code compatibility.",
            },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
            lastVerified: "2026-06-06",
          },
        ],
      },
      canonical: {
        events: ["tool.pre", "tool.post", "session.start"],
        mechanism: ["command-env", "command-stdin"],
        matcherKinds: ["regex", "none-imperative"],
        decision: [
          { kind: "observe" },
          { kind: "block", outcomes: ["allow", "deny", "ask"] },
          { kind: "modify", operations: ["inject-context"] },
        ],
      },
      axm: {
        support: "unsupported",
        reason: "AXM has not implemented a Grok CLI hooks writer.",
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
