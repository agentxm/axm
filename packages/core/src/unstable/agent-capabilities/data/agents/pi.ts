import type { Agent } from "../../schema.js";

export const piAgent = {
  id: "pi",
  name: "Pi",
  vendor: "Mario Zechner",
  homepage: "https://github.com/badlogic/pi-mono",
  interfaces: ["cli"],
  family: null,
  rootDir: ".pi",
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
      lifecycle: "supported",
      notes:
        "Skills follow the Agent Skills SKILL.md standard and are invoked via /skill:name. Pi discovers them from .pi/skills and .agents/skills (project, searched up through parent directories) and ~/.pi/agent/skills and ~/.agents/skills (user).\n",
      docs: [],
      sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".pi/skills",
    },
    command: {
      lifecycle: "supported",
      notes:
        "Custom slash commands are Markdown prompt templates with {{variable}} interpolation, expanded via /templatename. Stored in .pi/prompts (project) or ~/.pi/agent/prompts (user). Prompt templates have no industry spec yet.\n",
      docs: [],
      sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      directory: ".pi/prompts",
    },
    "mcp-server": {
      lifecycle: "unsupported",
      notes:
        'Pi ships a deliberate "no MCP" core with only four built-in tools (read, write, edit, bash). MCP can only be added by installing or building a TypeScript extension; there is no native MCP server configuration.\n',
      docs: [],
      sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
    },
    subagent: {
      lifecycle: "unsupported",
      notes:
        "Pi has no built-in subagent system by design. Multi-agent workflows are expected to be composed externally (e.g. spawning pi instances under tmux) or via a TypeScript extension.\n",
      docs: [],
      sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
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
        "AGENTS.md and CLAUDE.md context load at startup from the global directory (~/.pi/agent), parent directories, and the current directory; all matching files are concatenated.\n",
      docs: [],
      sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
      lastVerified: "2026-05-18",
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
    lifecycle: "unsupported",
    notes:
      "Pi has no per-call approval prompts and no permission config file. Tools run without confirmation; the philosophy is to run pi in a container or supply a confirmation flow via extension. Tool availability is selected at invocation with --tools and --no-builtin-tools, but this is tool enablement rather than a permission-grant surface.\n",
    docs: [],
    sources: ["https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md"],
  },
} as const satisfies Agent;
