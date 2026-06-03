import type { Agent } from "../../schema.js";

export const githubCopilotAgent = {
  id: "github-copilot",
  name: "GitHub Copilot",
  vendor: "GitHub",
  homepage: "https://github.com/features/copilot",
  interfaces: ["ide-extension", "cli"],
  family: "github",
  rootDir: ".github",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "GitHub Copilot documentation",
      url: "https://docs.github.com/en/copilot",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes:
        "VS Code agent mode, the Copilot CLI, and the cloud agent read SKILL.md skills from .github/skills (project) and ~/.copilot/skills (user); .claude/skills is also recognized.\n",
      docs: [],
      sources: [
        "https://code.visualstudio.com/docs/copilot/customization/agent-skills",
        "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills",
      ],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".github/skills",
    },
    command: {
      lifecycle: "supported",
      notes:
        "VS Code Copilot prompt files (.prompt.md) act as slash commands under .github/prompts; the Copilot CLI does not yet support custom commands.\n",
      docs: [],
      sources: ["https://code.visualstudio.com/docs/copilot/customization/prompt-files"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      directory: ".github/prompts",
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: [
        "https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent",
      ],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      transports: ["stdio", "http", "sse"],
      config: {
        serversKey: "servers",
        nativeEnabled: false,
        targets: [
          {
            scope: "project",
            path: ".vscode/mcp.json",
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
      sources: ["https://docs.github.com/en/copilot/reference/custom-agents-configuration"],
      lastVerified: "2026-05-16",
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
      notes: null,
      docs: [],
      sources: ["https://code.visualstudio.com/docs/copilot/customization/custom-instructions"],
      lastVerified: "2026-05-16",
      scopes: ["project"],
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
      "https://code.visualstudio.com/docs/copilot/reference/copilot-settings",
      "https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode",
      "https://code.visualstudio.com/docs/copilot/agents/agent-tools",
      "https://docs.github.com/en/copilot/concepts/agents/coding-agent",
    ],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    mechanism: ["config-file"],
    configFiles: [
      {
        scope: "user",
        path: "~/Library/Application Support/Code/User/settings.json",
        format: "vscode-settings",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".vscode/settings.json",
        format: "vscode-settings",
        gitignored: false,
      },
    ],
    grammar: {
      style: "regex",
      example: '"/^axm(\\\\s|$)/": true',
      notes:
        "chat.tools.terminal.autoApprove keys are literal command names or /regex/ patterns mapping to bool. Default deny rules for rm, chmod, etc. remain active unless chat.tools.terminal.ignoreDefaultAutoApproveRules is set.\n",
    },
    prerequisites: [],
    cliFlags: [],
    grants: {
      shell: {
        target: ".vscode/settings.json",
        patch: {
          "chat.tools.terminal.autoApprove": {
            "${tool}": true,
            "/^${tool}(\\s|$)/": true,
          },
        },
        template: null,
      },
      filesystem: {
        target: ".vscode/settings.json",
        patch: {
          "chat.tools.edits.autoApprove": {
            "**/*": true,
          },
        },
        template: null,
      },
    },
  },
} as const satisfies Agent;
