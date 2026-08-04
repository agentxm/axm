import type { Agent } from "../../schema.js";
export const grokCliAgent = {
  id: "grok-cli",
  name: "Grok Build",
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
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Grok exposes built-in pager commands and user-invocable skills, but no separate user-authored command directory is documented.",
        docs: [],
        sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented Grok CLI command installation.",
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "MCP servers are managed with grok mcp commands or [mcp_servers] tables in ~/.grok/config.toml and project .grok/config.toml. Grok also reads ~/.claude.json, .cursor/mcp.json, and .mcp.json compatibility files.",
        docs: [],
        sources: ["https://docs.x.ai/build/features/mcp-servers"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: { variables: "braced", defaults: true },
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-06-06",
        writer: null,
        reason: "AXM has not implemented a Grok CLI MCP config writer.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Agent definitions are Markdown files in .grok/agents or ~/.grok/agents and may add new subagent types or shadow the built-in general-purpose, explore, and plan types. Personas are a separate TOML overlay under .grok/personas and are not modeled as subagents.",
        docs: [],
        sources: [
          "https://docs.x.ai/build/features/subagents",
          "https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/16-subagents.md",
        ],
        scopes: ["user", "project"],
        directory: ".grok/agents",
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
          "xAI Grok CLI discovers hook scripts from .grok hooks paths and also advertises Claude Code hook compatibility. Exact in-app hook event details should be reverified before adding a writer.",
        docs: [],
        sources: ["https://docs.x.ai/build/features/skills-plugins-marketplaces"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason: "AXM has not implemented a Grok CLI hooks writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Project rules are merged by directory depth from the repository root. Grok also reads documented AGENTS.md filename variants and Markdown files in .grok/rules, with compatibility for .claude/rules and .cursor/rules; AXM writes the universal AGENTS.md surface.",
      docs: [],
      sources: ["https://docs.x.ai/build/features/project-rules"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-07-22",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Grok [permission] settings define allow, deny, and ask lists using Tool(pattern) rules. UI permission modes and CLI flags provide coarse approval behavior in addition to the per-tool grammar.",
      docs: [],
      sources: ["https://docs.x.ai/build/settings", "https://docs.x.ai/build/settings/reference"],
      scopes: ["user"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.grok/config.toml",
          format: "toml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "Bash(git *)",
        notes:
          "Patterns can target tools and their arguments, including Read(src/**) and MCPTool(server__*).",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--always-approve",
          note: "Skip permission prompts for tool calls.",
        },
        {
          flag: "--permission-mode <mode>",
          note: "Selects default, dontAsk, acceptEdits, bypassPermissions, or plan mode.",
        },
        {
          flag: "--deny <rule>",
          note: "Adds a deny rule for the session.",
        },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented Grok CLI permission grant writing.",
    },
  },
} as const satisfies Agent;
