import type { Agent } from "../../schema.js";
export const piAgent = {
  id: "pi",
  name: "Pi",
  vendor: "Mario Zechner",
  homepage: "https://github.com/badlogic/pi-mono",
  interfaces: ["cli"],
  family: null,
  rootDir: ".pi",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Pi coding agent documentation",
      url: "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md",
    },
  ],
  capabilities: {
    skill: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skills follow the Agent Skills SKILL.md standard and are invoked via /skill:name. Pi discovers them from .pi/skills and .agents/skills (project, searched up through parent directories) and ~/.pi/agent/skills and ~/.agents/skills (user).\n",
        docs: [],
        sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".pi/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-18",
        writer: null,
      },
    },
    command: {
      canonical: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom slash commands are Markdown prompt templates with {{variable}} interpolation, expanded via /templatename. Stored in .pi/prompts (project) or ~/.pi/agent/prompts (user). Prompt templates have no industry spec yet.\n",
        docs: [],
        sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        directory: ".pi/prompts",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-18",
        writer: null,
      },
    },
    "mcp-server": {
      canonical: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          'Pi ships a deliberate "no MCP" core with only four built-in tools (read, write, edit, bash). MCP can only be added by installing or building a TypeScript extension; there is no native MCP server configuration.\n',
        docs: [],
        sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    subagent: {
      canonical: {
        availability: {
          via: "plugin",
          provider: "third-party",
          plugin: {
            name: "pi-subagents",
            homepage: "https://github.com/nicobailon/pi-subagents",
            author: "nicobailon",
            distribution: {
              mechanism: "agent-native",
              installHint: "pi install npm:pi-subagents",
              packageRef: "npm:pi-subagents",
            },
            detection: {
              paths: [
                {
                  scope: "user",
                  path: "~/.pi/agent/extensions/subagent/",
                  kind: "dir",
                },
              ],
              configKeys: [
                {
                  scope: "user",
                  file: "~/.pi/agent/settings.json",
                  key: "subagents",
                },
                {
                  scope: "project",
                  file: ".pi/settings.json",
                  key: "subagents",
                },
              ],
            },
          },
        },
        vendorStatus: { state: "active" },
        notes:
          "Pi has no built-in subagent system by design, but the third-party pi-subagents plugin adds a subagent extension surface. AXM describes and may detect this plugin, but does not install, resolve, or manage it.\n",
        docs: [],
        sources: [
          "https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md",
          "https://github.com/nicobailon/pi-subagents",
        ],
        scopes: ["user", "project"],
      },
      axm: {
        support: "unsupported",
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
        notes:
          "AGENTS.md and CLAUDE.md context load at startup from the global directory (~/.pi/agent), parent directories, and the current directory; all matching files are concatenated.\n",
        docs: [],
        sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-18",
        writer: null,
      },
    },
    hook: {
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
  },
  permissions: {
    canonical: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes:
        "Pi has no per-call approval prompts and no permission config file. Tools run without confirmation; the philosophy is to run pi in a container or supply a confirmation flow via extension. Tool availability is selected at invocation with --tools and --no-builtin-tools, but this is tool enablement rather than a permission-grant surface.\n",
      docs: [],
      sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
    },
    axm: {
      support: "unsupported",
      writer: null,
    },
  },
} as const satisfies Agent;
