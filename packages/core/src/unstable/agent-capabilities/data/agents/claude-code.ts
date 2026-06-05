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
    project: {
      markers: [
        {
          kind: "file",
          path: ".mcp.json",
          signal: "ambiguous",
          note: "Universal MCP file, not Claude-specific.",
        },
      ],
    },
    user: {
      markers: [
        { kind: "dir", path: "~/.claude", signal: "definitive", note: null },
        { kind: "executable", name: "claude", signal: "definitive", note: "CLI on PATH." },
      ],
    },
  },
  docs: [
    {
      label: "Claude Code documentation",
      url: "https://docs.claude.com/en/docs/claude-code",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.claude.com/en/docs/claude-code/skills"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".claude/skills",
    },
    command: {
      lifecycle: "supported",
      notes:
        "Custom slash commands are Markdown prompt files under .claude/commands. Commands have no industry spec yet.\n",
      docs: [],
      sources: ["https://docs.claude.com/en/docs/claude-code/slash-commands"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      directory: ".claude/commands",
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://code.claude.com/docs/en/mcp"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      transports: ["stdio", "http", "sse"],
      mcpEnvExpansion: {
        variables: "braced",
        defaults: true,
      },
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
    subagent: {
      lifecycle: "supported",
      notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://docs.claude.com/en/docs/claude-code/sub-agents"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      directory: ".claude/agents",
      layout: "directory",
    },
    files: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      lifecycle: "supported",
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
    hook: {
      lifecycle: "supported",
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
  },
  permissions: {
    lifecycle: "supported",
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
