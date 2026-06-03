import type { Agent } from "../../schema.js";

export const claudeCodeAgent = {
  id: "claude-code",
  name: "Claude Code",
  vendor: "Anthropic",
  homepage: "https://claude.com/claude-code",
  interfaces: ["cli", "ide-extension"],
  family: "anthropic",
  rootDir: ".claude",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Claude Code documentation",
      url: "https://docs.claude.com/en/docs/claude-code",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.claude.com/en/docs/claude-code/skills"],
    lastVerified: "2026-05-16",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".claude/skills",
  },
  commands: {
    lifecycle: "available",
    notes:
      "Custom slash commands are Markdown prompt files under .claude/commands. Commands have no industry spec yet.\n",
    docs: [],
    sources: ["https://docs.claude.com/en/docs/claude-code/slash-commands"],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    directory: ".claude/commands",
  },
  mcp: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.claude.com/en/docs/claude-code/mcp"],
    lastVerified: "2026-05-16",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio", "http", "sse"],
    config: {
      serversKey: "mcpServers",
      nativeEnabled: false,
      targets: [
        {
          scope: "project",
          path: ".mcp.json",
          format: "json",
        },
      ],
      stdio: {
        typeField: {
          name: "type",
          value: "stdio",
        },
        command: "split",
        envKey: "env",
      },
      remote: {
        typeField: {
          name: "type",
          value: {
            "streamable-http": "http",
            sse: "sse",
          },
        },
        urlKey: {
          "streamable-http": "url",
          sse: "url",
        },
        headersKey: "headers",
      },
      transform: null,
    },
  },
  subagents: {
    lifecycle: "available",
    notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://docs.claude.com/en/docs/claude-code/sub-agents"],
    lastVerified: "2026-05-16",
    scopes: ["user", "project"],
    directory: ".claude/agents",
    layout: "directory",
  },
  instructions: {
    lifecycle: "available",
    notes: "Reads CLAUDE.md, not the AGENTS.md spec filename.",
    docs: [],
    sources: ["https://docs.claude.com/en/docs/claude-code/memory"],
    lastVerified: "2026-05-16",
    scopes: ["user", "project"],
    standardsCompliance: "parity",
    convention: "vendor",
    kind: "own-file",
    files: ["CLAUDE.md"],
    nestedDiscovery: true,
    importSyntax: "at-path",
  },
  rules: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  hooks: {
    lifecycle: "available",
    notes:
      "Managed hooks merge into the Claude Code settings hooks block and execute materialized AXM package entrypoints.",
    docs: [],
    sources: [
      "https://docs.claude.com/en/docs/claude-code/hooks",
      "https://docs.claude.com/en/docs/claude-code/settings",
    ],
    lastVerified: "2026-06-02",
    scopes: ["user", "project"],
    configFiles: [
      {
        scope: "user",
        path: "~/.claude/settings.json",
        format: "json",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".claude/settings.json",
        format: "json",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".claude/settings.local.json",
        format: "json",
        gitignored: true,
      },
    ],
    serializer: "claude-code-settings",
  },
  permissions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: [
      "https://docs.claude.com/en/docs/claude-code/iam",
      "https://docs.claude.com/en/docs/claude-code/settings",
    ],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    mechanism: ["config-file"],
    configFiles: [
      {
        scope: "user",
        path: "~/.claude/settings.json",
        format: "json",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".claude/settings.json",
        format: "json",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".claude/settings.local.json",
        format: "json",
        gitignored: true,
      },
    ],
    grammar: {
      style: "tool-call",
      example: "Bash(axm:*)",
      notes:
        "Tool(specifier) with * wildcards. Evaluated deny > ask > allow (first match wins). Settings merge across scopes rather than override.\n",
    },
    prerequisites: [],
    cliFlags: [],
    grants: {
      shell: {
        target: "~/.claude/settings.json",
        patch: {
          permissions: {
            allow: ["Bash(${tool}:*)"],
          },
        },
        template: null,
      },
      filesystem: {
        target: "~/.claude/settings.json",
        patch: {
          permissions: {
            allow: [
              "Read(${workspaceRoot}/**)",
              "Write(${workspaceRoot}/**)",
              "Edit(${workspaceRoot}/**)",
            ],
          },
        },
        template: null,
      },
    },
  },
} as const satisfies Agent;
