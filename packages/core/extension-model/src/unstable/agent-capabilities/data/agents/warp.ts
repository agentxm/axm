import type { Agent } from "../../schema.js";
export const warpAgent = {
  id: "warp",
  name: "Warp",
  vendor: "Warp",
  homepage: "https://www.warp.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.warp", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Warp documentation",
      url: "https://docs.warp.dev",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.warp.dev/agent-platform/capabilities/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Warp stores project MCP servers in .warp/.mcp.json and user servers in ~/.warp/.mcp.json under mcpServers.",
        docs: [],
        sources: ["https://docs.warp.dev/agent-platform/capabilities/mcp/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "sse", "http"],
        mcpEnvExpansion: { variables: "braced", defaults: false },

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    subagent: {
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
        "Warp discovers hierarchical AGENTS.md project rules and exposes user-level rules through Warp Drive.",
      docs: [],
      sources: ["https://docs.warp.dev/agent-platform/capabilities/rules/"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
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
      notes:
        "Warp Agent Profiles configure autonomy per action and regular-expression command allowlists and denylists; deny rules take precedence.",
      docs: [],
      sources: ["https://docs.warp.dev/agent-platform/capabilities/agent-profiles-permissions/"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: {
        style: "regex",
        example: "ls(\\s.*)?",
        notes:
          "Command allowlist and denylist entries are regular expressions configured in Settings.",
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
