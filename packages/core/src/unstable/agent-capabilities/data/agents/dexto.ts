import type { Agent } from "../../schema.js";
export const dextoAgent = {
  id: "dexto",
  name: "Dexto",
  vendor: "Truffle AI",
  homepage: "https://www.dexto.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.dexto", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Dexto documentation",
      url: "https://docs.dexto.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://github.com/truffle-ai/dexto/blob/main/packages/core/src/skills/workspace-skill-source.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
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
          "Dexto declares MCP servers under mcpServers in a project agent.yml. The vendor schema adds connectionMode and type fields around the standard server definitions.",
        docs: [],
        sources: ["https://docs.dexto.ai/docs/mcp/overview/"],
        scopes: ["project"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
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
    files: {
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
    rule: {
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
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Dexto permissions use manual or auto-approve mode plus alwaysAllow and alwaysDeny tool policies in agent.yml.",
      docs: [],
      sources: ["https://docs.dexto.ai/docs/guides/configuring-dexto/permissions"],
      scopes: ["project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "project",
          path: "agent.yml",
          format: "yaml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: "mcp--filesystem--write_file",
        notes:
          "toolPolicies.alwaysAllow and toolPolicies.alwaysDeny contain tool identifiers such as read_file, bash_exec, and mcp--server--tool.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--auto-approve",
          note: "Enables auto-approve mode for the session.",
        },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
