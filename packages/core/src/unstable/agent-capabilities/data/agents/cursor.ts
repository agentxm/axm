import type { Agent } from "../../schema.js";
export const cursorAgent = {
  id: "cursor",
  name: "Cursor",
  vendor: "Anysphere",
  homepage: "https://cursor.com",
  interfaces: ["ide-extension", "cli"],
  family: "cursor",
  rootDir: ".cursor",
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        {
          kind: "file",
          path: "AGENTS.md",
          signal: "ambiguous",
          note: "Shared instruction filename used by multiple agents.",
        },
      ],
    },
    user: {
      markers: [
        { kind: "dir", path: "~/.cursor", signal: "definitive", note: null },
        {
          kind: "executable",
          name: "cursor-agent",
          signal: "definitive",
          note: "CLI on PATH.",
        },
      ],
    },
  },
  docs: [
    {
      label: "Cursor documentation",
      url: "https://docs.cursor.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Cursor 2.4 added Agent Skills (SKILL.md) across the editor and the cursor-agent CLI; it also loads .claude/skills and .codex/skills for cross-tool compatibility.\n",
        docs: [],
        sources: ["https://cursor.com/docs/skills.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".cursor/skills",
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
          "Custom commands are Markdown prompt files under .cursor/commands (project) or ~/.cursor/commands (user); documented as a beta feature.\n",
        docs: [],
        sources: [
          "https://docs.cursor.com/en/agent/chat/commands",
          "https://cursor.com/changelog/1-6",
        ],
        scopes: ["user", "project"],
        directory: ".cursor/commands",
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
        sources: ["https://cursor.com/docs/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: {
          config: {
            serversKey: "mcpServers",
            nativeEnabled: false,
            targets: [
              {
                scope: "project",
                path: ".cursor/mcp.json",
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
        notes:
          "Custom subagents are Markdown files with YAML frontmatter under .cursor/agents (project) or ~/.cursor/agents (user); added in Cursor 2.4.\n",
        docs: [],
        sources: ["https://cursor.com/docs/subagents.md"],
        scopes: ["user", "project"],
        directory: ".cursor/agents",
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
        notes: null,
        docs: [],
        sources: ["https://cursor.com/docs/rules.md"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".cursor/rules",
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
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Cursor hooks run custom scripts around agent-loop stages. The native hooks.json shape is a direct event-to-command array, not AXM's current grouped command-stdin serializer shape.",
        docs: [],
        sources: ["https://cursor.com/docs/hooks.md"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
        reason:
          "Cursor's hooks.json maps each event to a flat command array; AXM's only hook serializer emits grouped command-stdin entries, so a writer needs a new serializer rather than catalog data.",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [
        "https://cursor.com/docs/cli/reference/permissions.md",
        "https://cursor.com/docs/cli/reference/parameters.md",
        "https://cursor.com/docs/agent/tools/terminal",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.cursor/permissions.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.cursor/sandbox.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".cursor/sandbox.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.cursor/cli-config.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".cursor/cli.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "prefix",
        example: "axm",
        notes:
          "IDE: case-sensitive command prefix in terminalAllowlist. CLI: Tool-call syntax Shell()/Read()/Write() with glob patterns. Deny always beats allow.\n",
      },
      prerequisites: [
        {
          key: "Settings > Cursor Settings > Agents > Auto-Run",
          value: "Run in Sandbox | Run Everything",
          scope: "user",
          note: "IDE Auto-Run must be enabled before terminalAllowlist takes effect.",
        },
      ],
      cliFlags: [
        {
          flag: "--force",
          note: "Force allow commands unless explicitly denied.",
        },
        {
          flag: "--yolo",
          note: "Alias for --force.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: {
        grants: {
          shell: {
            target: "~/.cursor/permissions.json",
            patch: {
              terminalAllowlist: ["${tool}"],
            },
            template: null,
          },
          cliShell: {
            target: ".cursor/cli.json",
            patch: {
              permissions: {
                allow: ["Shell(${tool})", "Shell(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            target: ".cursor/sandbox.json",
            patch: {
              type: "workspace_readwrite",
              additionalReadwritePaths: [],
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
