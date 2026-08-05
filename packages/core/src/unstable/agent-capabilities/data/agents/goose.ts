import type { Agent } from "../../schema.js";
export const gooseAgent = {
  id: "goose",
  name: "Goose",
  vendor: "Agentic AI Foundation (AAIF)",
  homepage: "https://goose-docs.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".goose",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Goose documentation",
      url: "https://goose-docs.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://goose-docs.ai/docs/mcp/skills-mcp/"],
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
        notes:
          "Goose Recipes are reusable YAML workflows run with goose run --recipe or scheduled separately; they are not an installable slash-command format.",
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
        notes: null,
        docs: [],
        sources: ["https://goose-docs.ai/docs/getting-started/using-extensions/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-07-22",
        writer: null,
        reason: "AXM has not implemented a Goose YAML extension config writer.",
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
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Goose exposes permission mode, tool permissions, and .gooseignore controls. AXM has not modeled a narrow permission grant writer for Goose.",
      docs: [],
      sources: ["https://goose-docs.ai/docs/guides/managing-tools/tool-permissions/"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-07-22",
      writer: null,
      reason: "AXM has not implemented a Goose permission grant writer.",
    },
  },
} as const satisfies Agent;
