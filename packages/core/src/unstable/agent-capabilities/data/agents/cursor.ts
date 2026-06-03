import type { Agent } from "../../schema.js";

export const cursorAgent = {
  id: "cursor",
  name: "Cursor",
  vendor: "Anysphere",
  homepage: "https://cursor.com",
  interfaces: ["ide-extension", "cli"],
  family: "cursor",
  rootDir: ".cursor",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Cursor documentation",
      url: "https://docs.cursor.com",
    },
  ],
  skills: {
    lifecycle: "available",
    notes:
      "Cursor 2.4 added Agent Skills (SKILL.md) across the editor and the cursor-agent CLI; it also loads .claude/skills and .codex/skills for cross-tool compatibility.\n",
    docs: [],
    sources: ["https://cursor.com/docs/context/skills", "https://cursor.com/changelog/2-4"],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".cursor/skills",
  },
  commands: {
    lifecycle: "available",
    notes:
      "Custom commands are Markdown prompt files under .cursor/commands (project) or ~/.cursor/commands (user); documented as a beta feature.\n",
    docs: [],
    sources: ["https://docs.cursor.com/en/agent/chat/commands", "https://cursor.com/changelog/1-6"],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    directory: ".cursor/commands",
  },
  mcp: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.cursor.com/advanced/model-context-protocol"],
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
  subagents: {
    lifecycle: "available",
    notes:
      "Custom subagents are Markdown files with YAML frontmatter under .cursor/agents (project) or ~/.cursor/agents (user); added in Cursor 2.4.\n",
    docs: [],
    sources: ["https://cursor.com/docs/subagents", "https://cursor.com/changelog/2-4"],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    directory: ".cursor/agents",
    layout: "directory",
  },
  instructions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.cursor.com/en/cli/using"],
    lastVerified: "2026-05-16",
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "universal",
    kind: "agents-md",
    files: ["AGENTS.md"],
    nestedDiscovery: false,
    importSyntax: null,
  },
  rules: {
    lifecycle: "available",
    notes: "No industry spec for rule files yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://docs.cursor.com/en/context/rules"],
    lastVerified: "2026-05-16",
    scopes: ["project"],
    directory: ".cursor/rules",
  },
  hooks: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  permissions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: [
      "https://cursor.com/docs/reference/permissions",
      "https://cursor.com/docs/reference/sandbox",
      "https://cursor.com/docs/agent/tools/terminal",
      "https://cursor.com/docs/cli/reference/permissions",
    ],
    lastVerified: "2026-05-18",
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
        note: "Bypasses cursor-agent prompts (community-documented; verify against --help).",
      },
      {
        flag: "--yolo",
        note: "Bypasses cursor-agent prompts (community-documented; verify against --help).",
      },
    ],
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
} as const satisfies Agent;
