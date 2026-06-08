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
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Grok exposes pager-local slash commands, skills-as-commands, and user-level custom commands discovered from ~/.agents/commands.\n",
        docs: [],
        sources: [
          "https://docs.x.ai/build/features/skills-plugins-marketplaces",
          "https://docs.x.ai/build/modes-and-commands",
        ],
        scopes: ["user"],
        directory: "~/.agents/commands",
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-06-06",
        writer: null,
        reason: "AXM has not implemented Grok CLI command installation.",
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
        status: "unsupported",
        lastVerified: "2026-06-06",
        writer: null,
        reason: "AXM has not implemented a Grok CLI MCP config writer.",
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
    files: {
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
        status: "supported",
        lastVerified: "2026-06-06",
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
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Grok exposes permission prompting mode through config.toml and the --always-approve CLI flag, but docs do not describe per-tool allow/deny grant rules.",
      docs: [],
      sources: ["https://docs.x.ai/build/modes-and-commands"],
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
        style: "prefix",
        example: 'permission_mode = "always-approve"',
        notes:
          "The documented permission mode is a coarse approval prompt setting, not a per-tool grant grammar.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--always-approve",
          note: "Skip permission prompts for tool calls.",
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
