import type { Agent } from "../../schema.js";
export const adalAgent = {
  id: "adal",
  name: "AdaL",
  vendor: "SylphAI",
  homepage: "https://adalagent.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".adal",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "AdaL documentation",
      url: "https://docs.sylph.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.sylph.ai/features/plugins-and-skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".adal/skills",
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
          "AdaL manages MCP servers through the /mcp CLI flow and stores OAuth tokens under ~/.adal/mcp-auth; the docs describe add/remove/test actions rather than a stable editable config file.",
        docs: [],
        sources: [
          "https://docs.sylph.ai/features/mcp-support-proposed",
          "https://raw.githubusercontent.com/SylphAI-Inc/adal-cli/main/docs-site/docs/03-features/mcp-support-proposed.md",
        ],
        scopes: ["user"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-06-06",
        writer: null,
        reason: "AXM has not implemented an AdaL MCP writer for the CLI-managed MCP store.",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.sylph.ai/getting-started/workflows-and-examples"],
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
        lastVerified: "2026-07-22",
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
        "AdaL exposes /permissions to configure approval behavior, but the public docs do not document a stable settings file shape for AXM to patch.",
      docs: [],
      sources: [
        "https://docs.sylph.ai/features/slash-commands",
        "https://raw.githubusercontent.com/SylphAI-Inc/adal-cli/main/docs-site/docs/03-features/slash-commands.md",
      ],
      scopes: ["user"],
      mechanism: ["ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason:
        "AXM has not implemented an AdaL permission writer for the interactive /permissions surface.",
    },
  },
} as const satisfies Agent;
