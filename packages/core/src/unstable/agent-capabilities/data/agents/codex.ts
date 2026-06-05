import type { Agent } from "../../schema.js";

export const codexAgent = {
  id: "codex",
  name: "Codex",
  vendor: "OpenAI",
  homepage: "https://developers.openai.com/codex",
  interfaces: ["cli", "ide-extension"],
  family: "openai",
  rootDir: ".codex",
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
        { kind: "dir", path: "~/.codex", signal: "definitive", note: null },
        { kind: "executable", name: "codex", signal: "definitive", note: "CLI on PATH." },
      ],
    },
  },
  docs: [
    {
      label: "Codex documentation",
      url: "https://developers.openai.com/codex",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes:
        "Reads SKILL.md skills from repository (.agents/skills) and user (~/.agents/skills) locations with progressive disclosure, using the cross-tool Agent Skills convention rather than a .codex/ path.\n",
      docs: [],
      sources: ["https://developers.openai.com/codex/skills"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".codex/skills",
    },
    command: {
      lifecycle: "supported",
      notes:
        "Custom prompts are user-scope Markdown slash commands in ~/.codex/prompts. Deprecated by OpenAI in favor of skills for reusable instructions, and there is no project-scoped command directory.\n",
      docs: [],
      sources: [
        "https://developers.openai.com/codex/custom-prompts",
        "https://developers.openai.com/codex/cli/slash-commands",
      ],
      lastVerified: "2026-05-18",
      scopes: ["user"],
      directory: ".codex/prompts",
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/openai/codex/blob/main/docs/config.md#mcp-servers"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      transports: ["stdio", "http"],
      mcpEnvExpansion: {
        variables: "none",
        defaults: false,
      },
      config: {
        serversKey: "mcp_servers",
        nativeEnabled: true,
        targets: [
          {
            scope: "project",
            path: ".codex/config.toml",
            format: "toml",
          },
          {
            scope: "user",
            path: "~/.codex/config.toml",
            format: "toml",
          },
        ],
        stdio: {
          typeField: null,
          command: "split",
          envKey: "env",
        },
        remote: {
          typeField: {
            name: "type",
            value: {
              "streamable-http": "streamable-http",
              sse: "sse",
            },
          },
          urlKey: {
            "streamable-http": "url",
            sse: "url",
          },
          headersKey: "http_headers",
        },
        transform: "codex-toml",
      },
    },
    subagent: {
      lifecycle: "supported",
      notes:
        "Custom agents are standalone TOML files under .codex/agents (project) or ~/.codex/agents (user); a custom agent overrides a built-in of the same name.\n",
      docs: [],
      sources: ["https://developers.openai.com/codex/subagents"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      directory: ".codex/agents",
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
      sources: ["https://github.com/openai/codex/blob/main/docs/agents_md.md"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
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
      "https://developers.openai.com/codex/config-reference",
      "https://developers.openai.com/codex/config-advanced",
      "https://developers.openai.com/codex/security",
      "https://developers.openai.com/codex/rules",
    ],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    mechanism: ["config-file", "cli-flag"],
    configFiles: [
      {
        scope: "user",
        path: "~/.codex/config.toml",
        format: "toml",
        gitignored: false,
      },
      {
        scope: "user",
        path: "~/.codex/rules/${tool}.rules",
        format: "starlark",
        gitignored: false,
      },
    ],
    grammar: {
      style: "starlark-rule",
      example: 'prefix_rule(pattern=["axm"], decision="allow")',
      notes:
        "Per-command allowlisting is Starlark prefix_rule() in ~/.codex/rules/*.rules. Sandbox and approval mode live separately in config.toml. Most restrictive match wins (forbidden > prompt > allow).\n",
    },
    prerequisites: [
      {
        key: "sandbox_mode",
        value: "workspace-write",
        scope: "user",
        note: "Required to grant project write access.",
      },
      {
        key: "approval_policy",
        value: "never",
        scope: "user",
        note: "Suppresses approval prompts.",
      },
    ],
    cliFlags: [
      {
        flag: "--full-auto",
        note: "Equivalent one-shot bypass of prompts and sandbox restrictions.",
      },
      {
        flag: "--sandbox workspace-write",
        note: null,
      },
      {
        flag: "--ask-for-approval never",
        note: null,
      },
    ],
    grants: {
      shell: {
        target: "~/.codex/rules/${tool}.rules",
        patch: null,
        template:
          'prefix_rule(\n    pattern = ["${tool}"],\n    decision = "allow",\n    justification = "${tool} CLI trusted in this workspace.",\n)\n',
      },
      filesystem: {
        target: "~/.codex/config.toml",
        patch: {
          sandbox_mode: "workspace-write",
          sandbox_workspace_write: {
            writable_roots: ["${workspaceRoot}"],
            network_access: true,
          },
        },
        template: null,
      },
    },
  },
} as const satisfies Agent;
