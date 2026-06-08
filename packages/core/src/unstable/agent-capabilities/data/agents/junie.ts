import type { Agent } from "../../schema.js";
export const junieAgent = {
  id: "junie",
  name: "Junie",
  vendor: "JetBrains",
  homepage: "https://www.jetbrains.com/junie",
  interfaces: ["ide-extension"],
  family: "jetbrains",
  rootDir: ".junie",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Junie documentation",
      url: "https://www.jetbrains.com/help/junie",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://junie.jetbrains.com/docs/agent-skills.html"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".junie/skills",
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
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://junie.jetbrains.com/docs/custom-slash-commands.html"],
        scopes: ["user", "project"],
        directory: ".junie/commands",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html"],
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
        status: "supported",
        lastVerified: "2026-06-06",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: ".junie/mcp/mcp.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.junie/mcp/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: null,
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: null,
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: "headers",
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
        sources: ["https://junie.jetbrains.com/docs/junie-cli-configuration.html"],
        scopes: ["user", "project"],
        directory: ".junie/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
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
          "Junie CLI reads persistent project guidance from .junie/AGENTS.md and suggests importing AGENTS.md-style files from other agents into that location.",
        docs: [],
        sources: [
          "https://junie.jetbrains.com/docs/guidelines-and-memory.html",
          "https://junie.jetbrains.com/docs/junie-cli-usage.html",
        ],
        scopes: ["project"],
        standardsCompliance: "parity",
        convention: "vendor",
        kind: "own-file",
        files: [".junie/AGENTS.md"],
        nestedDiscovery: false,
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
          "Junie CLI EAP hooks currently support only SessionStart command hooks from user config or explicit --config-location files. Default project hooks are ignored for safety, so AXM does not write Junie hooks yet.",
        docs: [],
        sources: [
          "https://junie.jetbrains.com/docs/junie-cli-hooks.html",
          "https://junie.jetbrains.com/docs/junie-cli-configuration.html",
        ],
        scopes: ["user"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason: "AXM has no trusted project hook writer target for Junie CLI hooks.",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Junie CLI uses the Action Allowlist for terminal commands, MCP tools, and other sensitive actions; brave mode allows all sensitive actions for a session.",
      docs: [],
      sources: [
        "https://junie.jetbrains.com/docs/junie-cli-usage.html",
        "https://junie.jetbrains.com/docs/action-allowlist.html",
      ],
      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [
        {
          scope: "user",
          path: "~/.junie/allowlist.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.junie/config.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "regex",
        example: "^\\Qaxm \\E[^\\s;&|<>@$]+.*$",
        notes:
          "Terminal rules can be exact commands, Java regular expressions, or standard regular expressions.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented a Junie Action Allowlist writer.",
    },
  },
} as const satisfies Agent;
