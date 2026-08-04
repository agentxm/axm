import type { Agent } from "../../schema.js";
export const rovodevAgent = {
  id: "rovodev",
  name: "Rovo Dev",
  vendor: "Atlassian",
  homepage: "https://www.atlassian.com/software/rovo-dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".rovodev",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".rovodev", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.rovodev", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Rovo Dev CLI skills",
      url: "https://support.atlassian.com/rovo/docs/extend-rovo-dev-cli-with-agent-skills/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Rovo Dev also reads universal .agents/skills in both project and user scopes.\n",
        docs: [],
        sources: [
          "https://support.atlassian.com/rovo/docs/extend-rovo-dev-cli-with-agent-skills/",
          "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".rovodev/skills",
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
        notes: "Rovo Dev saved prompts are stored under .rovodev/prompts.",
        docs: [],
        sources: [
          "https://support.atlassian.com/bitbucket-cloud/docs/rovo-dev-advanced-agentic-configuration/",
        ],
        scopes: ["user", "project"],
        directory: ".rovodev/prompts",
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
        notes: "Rovo Dev supports local and remote MCP server configuration.",
        docs: [],
        sources: [
          "https://support.atlassian.com/rovo/docs/connect-to-an-mcp-server-in-rovo-dev-cli/",
          "https://support.atlassian.com/bitbucket-cloud/docs/rovo-dev-advanced-agentic-configuration/",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: { variables: "braced", defaults: true },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://support.atlassian.com/rovo/docs/use-subagents-in-rovo-dev-cli/"],
        scopes: ["user", "project"],
        directory: ".rovodev/subagents",
        layout: "file",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Rovo Dev exposes event hooks including tool-permission, response-finished, and error events; the public surface is recorded without an AXM serializer model.",
        docs: [],
        sources: [
          "https://www.atlassian.com/blog/developer/streamline-rovo-dev-cli-with-event-hooks",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
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
      notes: "Rovo Dev reads hierarchical AGENTS.md memory files.",
      docs: [],
      sources: ["https://support.atlassian.com/rovo/docs/use-memory-in-rovo-dev-cli/"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Rovo Dev toolPermissions rules select allow, ask, or deny behavior by tool call.",
      docs: [],
      sources: ["https://support.atlassian.com/rovo/docs/manage-rovo-dev-cli-settings/"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "user",
          path: "~/.rovodev/config.yml",
          format: "yaml",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".rovodev/config.yml",
          format: "yaml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "Bash(git status)",
        notes: "Rules choose allow, ask, or deny, with a configurable default.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
