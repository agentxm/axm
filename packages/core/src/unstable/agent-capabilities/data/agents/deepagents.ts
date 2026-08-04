import type { Agent } from "../../schema.js";
export const deepagentsAgent = {
  id: "deepagents",
  name: "Deep Agents",
  vendor: "LangChain",
  homepage: "https://docs.langchain.com/oss/python/deepagents/overview",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.deepagents", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Deep Agents skills documentation",
      url: "https://docs.langchain.com/oss/python/deepagents/skills",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skill sources are layered built-in, then plugin, then user ~/.deepagents/<agent>/skills and ~/.agents/skills, then project .deepagents/skills and .agents/skills.\n",
        docs: [],
        sources: [
          "https://docs.langchain.com/oss/python/deepagents/skills",
          "https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/project_utils.py",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
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
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "The deepagents CLI natively supports MCP servers via 'mcp-servers add|list|tools|update|delete|connect' commands, project-level MCP config discovery/merge, per-server trust/approval, and MCP OAuth session management.\n",
        docs: [],
        sources: [
          "https://reference.langchain.com/python/deepagents-cli",
          "https://pypi.org/project/deepagents-cli/",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Deep Agents natively supports MCP servers, but the exact config file path, servers key, and serialization dialect are unverified; no AXM writer is defined to avoid fabricating an install path.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Each subagent is a folder holding an AGENTS.md with YAML frontmatter: .deepagents/agents/<name>/AGENTS.md for the project and ~/.deepagents/<agent>/agents/<name>/AGENTS.md for the user. The name field is optional and defaults to the folder name.",
        docs: [],
        sources: [
          "https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/subagents.py",
        ],
        scopes: ["user", "project"],
        directory: ".deepagents/agents",
        layout: "directory",
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Project instructions are auto-discovered from .deepagents/AGENTS.md first and the repository-root AGENTS.md second; both are loaded as memory. User-level instructions live at ~/.deepagents/AGENTS.md.",
      docs: [],
      sources: [
        "https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/project_utils.py",
        "https://docs.langchain.com/oss/python/deepagents/overview",
      ],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-07-24",
      writer: null,
    },
  },
  permissions: {
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
} as const satisfies Agent;
