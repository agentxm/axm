import type { Agent } from "../../schema.js";

export const githubCopilotCliAgent = {
  id: "github-copilot-cli",
  name: "GitHub Copilot CLI",
  vendor: "GitHub",
  homepage: "https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli",
  interfaces: ["cli"],
  family: "github",
  rootDir: ".copilot",
  detection: {
    project: {
      markers: [
        {
          kind: "file",
          path: ".mcp.json",
          signal: "supporting",
          note: "Project-level MCP config used by GitHub Copilot CLI and other MCP clients.",
        },
        {
          kind: "dir",
          path: ".github/copilot",
          signal: "supporting",
          note: "Repository and local Copilot CLI settings live under .github/copilot.",
        },
      ],
    },
    user: {
      markers: [
        { kind: "dir", path: "~/.copilot", signal: "definitive", note: null },
        { kind: "executable", name: "copilot", signal: "definitive", note: "CLI on PATH." },
      ],
    },
  },
  docs: [
    {
      label: "GitHub Copilot CLI documentation",
      url: "https://docs.github.com/en/copilot/how-tos/copilot-cli",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes:
        "GitHub Copilot CLI reads SKILL.md skills from project .github/skills, .claude/skills, or .agents/skills, and user skills from ~/.copilot/skills.\n",
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills",
        "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
      ],
      lastVerified: "2026-06-05",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".github/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: "GitHub Copilot CLI has no documented custom slash-command file surface.",
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/overview",
      ],
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers",
        "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
        "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
      ],
      lastVerified: "2026-06-05",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      transports: ["stdio", "http", "sse"],
      mcpEnvExpansion: {
        variables: "none",
        defaults: false,
      },
      config: {
        serversKey: "mcpServers",
        nativeEnabled: false,
        targets: [
          {
            scope: "user",
            path: "~/.copilot/mcp-config.json",
            format: "json",
          },
          {
            scope: "project",
            path: ".mcp.json",
            format: "json",
          },
        ],
        stdio: {
          typeField: {
            name: "type",
            value: "local",
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
      notes:
        "No industry spec for subagents yet; GitHub Copilot CLI custom agents are Markdown agent profiles under .github/agents or ~/.copilot/agents.\n",
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents",
        "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
      ],
      lastVerified: "2026-06-05",
      scopes: ["user", "project"],
      directory: ".github/agents",
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
      notes:
        "GitHub Copilot CLI supports AGENTS.md plus Copilot-specific instruction files; AXM syncs the cross-agent AGENTS.md convention.\n",
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions",
      ],
      lastVerified: "2026-06-05",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    hook: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    lifecycle: "supported",
    notes: null,
    docs: [],
    sources: [
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools",
      "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/configure-copilot-cli",
      "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference",
    ],
    lastVerified: "2026-06-05",
    scopes: ["user", "project"],
    mechanism: ["cli-flag"],
    configFiles: [],
    grammar: {
      style: "prefix",
      example: "--allow-tool='shell(axm:*)'",
      notes:
        "Copilot CLI permission flags use tool-kind patterns such as shell(git:*), write(path), url(domain), or MCP_SERVER(tool). Deny rules take precedence over allow rules.\n",
    },
    prerequisites: [],
    cliFlags: [
      {
        flag: "--allow-tool='shell(${tool}:*)'",
        note: "Allow a command family without prompting.",
      },
      {
        flag: "--allow-all-tools",
        note: "Allow all available tools without prompting.",
      },
      {
        flag: "--allow-all",
        note: "Allow all tools, paths, and URLs.",
      },
    ],
    grants: {
      shell: {
        target: "CLI invocation",
        patch: null,
        template: "--allow-tool='shell(${tool}:*)'",
      },
      filesystem: {
        target: "CLI invocation",
        patch: null,
        template: "--allow-tool='write(${workspaceRoot}/**)'",
      },
    },
  },
} as const satisfies Agent;
