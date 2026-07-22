import type { Agent } from "../../schema.js";
export const codestudioAgent = {
  id: "codestudio",
  name: "Code Studio",
  vendor: "Syncfusion",
  homepage: "https://www.syncfusion.com/code-studio/",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".codestudio",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".codestudio", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.codestudio", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Code Studio documentation",
      url: "https://help.syncfusion.com/code-studio/welcome-to-code-studio",
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
          "https://www.syncfusion.com/code-studio/features/",
          "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".codestudio/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Code Studio reusable prompt files are stored under .codestudio/prompts.",
        docs: [],
        sources: [
          "https://www.syncfusion.com/code-studio/features/",
          "https://github.com/syncfusion/code-studio-library",
        ],
        scopes: ["user", "project"],
        directory: ".codestudio/prompts",
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
        notes: "Code Studio supports custom stdio and remote HTTP MCP servers.",
        docs: [],
        sources: [
          "https://www.syncfusion.com/code-studio/features/",
          "https://help.syncfusion.com/code-studio/reference/configure-properties/mcp/customservers",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "parity",
        convention: "vendor",
        transports: ["stdio", "http"],
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
        notes: "Code Studio custom agents are stored under .codestudio/agents.",
        docs: [],
        sources: [
          "https://www.syncfusion.com/code-studio/features/",
          "https://github.com/syncfusion/code-studio-library",
        ],
        scopes: ["user", "project"],
        directory: ".codestudio/agents",
        layout: "file",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Code Studio supports AGENTS.md and its own instruction/rule surfaces; this entry models the universal AGENTS.md surface.",
        docs: [],
        sources: [
          "https://help.syncfusion.com/code-studio/features/globalagent",
          "https://www.syncfusion.com/code-studio/features/",
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
          "Code Studio exposes command-based lifecycle hooks, but its public documentation does not enumerate a stable event and matcher grammar.",
        docs: [],
        sources: ["https://www.syncfusion.com/code-studio/features/"],
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
