import type { Agent } from "../../schema.js";
export const claudeCodeAgent = {
  id: "claude-code",
  name: "Claude Code",
  vendor: "Anthropic",
  homepage: "https://claude.com/claude-code",
  interfaces: ["cli", "ide-extension"],
  family: "anthropic",
  rootDir: ".claude",
  lifecycle: { state: "active" },
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
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".claude/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    command: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom slash commands are Markdown prompt files under .claude/commands. Commands have no industry spec yet.\n",
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/slash-commands"],
        scopes: ["user", "project"],
        directory: ".claude/commands",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-18",
        writer: null,
      },
    },
    "mcp-server": {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://code.claude.com/docs/en/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: true,
        },
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: {
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
      },
    },
    subagent: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/sub-agents"],
        scopes: ["user", "project"],
        directory: ".claude/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    files: {
      canonical: {
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
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Reads CLAUDE.md, not the AGENTS.md spec filename.",
        docs: [],
        sources: ["https://docs.claude.com/en/docs/claude-code/memory"],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        kind: "own-file",
        files: ["CLAUDE.md"],
        nestedDiscovery: true,
        importSyntax: "at-path",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-16",
        writer: null,
      },
    },
    hook: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Managed hooks merge into the Claude Code settings hooks block and execute materialized AXM package entrypoints.",
        docs: [],
        sources: [
          "https://docs.claude.com/en/docs/claude-code/hooks",
          "https://docs.claude.com/en/docs/claude-code/settings",
        ],
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
      },
      axm: {
        support: "supported",
        lastVerified: "2026-06-02",
        writer: {
          serializer: "claude-code-settings",
        },
      },
    },
  },
  permissions: {
    canonical: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [
        "https://docs.claude.com/en/docs/claude-code/iam",
        "https://docs.claude.com/en/docs/claude-code/settings",
      ],
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
    },
    axm: {
      support: "supported",
      lastVerified: "2026-05-18",
      writer: {
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
    },
  },
} as const satisfies Agent;
