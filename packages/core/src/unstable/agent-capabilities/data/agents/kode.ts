import type { Agent } from "../../schema.js";
export const kodeAgent = {
  id: "kode",
  name: "Kode",
  vendor: "shareAI-lab",
  homepage: "https://github.com/shareAI-lab/Kode-Agent",
  interfaces: ["cli"],
  family: null,
  rootDir: ".kode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kode Agent repository",
      url: "https://github.com/shareAI-lab/Kode-Agent",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-Agent"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".kode/skills",
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
        notes:
          "Custom slash commands are Markdown files with YAML frontmatter under .kode/commands (project) and ~/.kode/commands (user); legacy .claude/commands is also read. Commands have no industry spec yet.",
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-cli/blob/main/docs/custom-commands.md"],
        scopes: ["user", "project"],
        directory: ".kode/commands",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Kode connects to MCP servers via .mcp.json (mcpServers key) and .mcprc, managed with kode mcp add/list/get/remove; server tools are exposed as mcp__<server>__<tool>. Kode also supports a ws transport that is outside AXM's transport enum.",
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-cli/blob/main/docs/mcp.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Native MCP config uses .mcp.json (mcpServers key), but the exact writer dialect is not documented; leaving the AXM MCP writer unbuilt pending an AXM product decision.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://github.com/shareAI-lab/Kode-Agent"],
        scopes: ["user", "project"],
        directory: ".kode/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
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
      notes: null,
      docs: [],
      sources: ["https://github.com/shareAI-lab/Kode-Agent"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://github.com/shareAI-lab/Kode-Agent"],
      scopes: ["user", "project"],
      mechanism: ["cli-flag"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [
        {
          flag: "--safe",
          note: "Enables permission checks instead of Kode's default YOLO mode.",
        },
        {
          flag: "--dangerously-skip-permissions",
          note: "Explicitly bypasses permission checks.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: {
        grants: {},
      },
    },
  },
} as const satisfies Agent;
