import type { Agent } from "../../schema.js";
export const piAgent = {
  id: "pi",
  name: "Pi",
  vendor: "Earendil Inc",
  homepage: "https://github.com/earendil-works/pi",
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
      url: "https://pi.dev/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skills follow the Agent Skills SKILL.md standard and are invoked via /skill:name. Pi discovers them from .pi/skills and .agents/skills (project, searched up through parent directories) and ~/.pi/agent/skills and ~/.agents/skills (user).\n",
        docs: [],
        sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".pi/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom slash commands are Markdown prompt templates with {{variable}} interpolation, expanded via /templatename. Stored in .pi/prompts (project) or ~/.pi/agent/prompts (user). Prompt templates have no industry spec yet.\n",
        docs: [],
        sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        directory: ".pi/prompts",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          'Pi ships a deliberate "no MCP" core. Its built-in tools are read, bash, edit, write, grep, find, and ls; MCP can only be added by installing or building a TypeScript extension.\n',
        docs: [],
        sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    subagent: {
      native: {
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
                  path: "~/.pi/agent/agents/",
                  kind: "dir",
                },
                {
                  scope: "project",
                  path: ".pi/agents/",
                  kind: "dir",
                },
                {
                  scope: "user",
                  path: "~/.pi/agent/extensions/subagent/agents/",
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
          "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md",
          "https://github.com/nicobailon/pi-subagents",
        ],
        scopes: ["user", "project"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Pi extension hooks are in-process TypeScript extension points; this is the core Pi project, not the oh-my-pi fork. AXM models the surface but does not serialize Pi extension hooks yet.",
        docs: [],
        sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented Pi extension hook writers.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "AGENTS.md and CLAUDE.md context load at startup from the global directory (~/.pi/agent), parent directories, and the current directory; all matching files are concatenated.\n",
      docs: [],
      sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes:
        "Pi has no per-tool permission-grant surface. It does provide project trust through defaultProjectTrust in settings.json, ~/.pi/agent/trust.json, /trust, and --approve/--no-approve; that gate controls loading project-local resources rather than individual tool calls.\n",
      docs: [],
      sources: ["https://pi.dev/docs/latest/settings"],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
