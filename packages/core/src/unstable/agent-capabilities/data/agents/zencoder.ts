import type { Agent } from "../../schema.js";
export const zencoderAgent = {
  id: "zencoder",
  name: "Zencoder",
  vendor: "Zencoder",
  homepage: "https://zencoder.ai",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".zencoder",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Zencoder documentation",
      url: "https://docs.zencoder.ai",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.zencoder.ai/llms-full.txt"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
        additionalReadPaths: [{ path: ".zencoder/skills", status: "deprecated" }],
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Zencoder exposes saved prompts through its product UI, but the vendor documentation does not define a filesystem command directory AXM can target.",
        docs: [],
        sources: ["https://docs.zencoder.ai/llms-full.txt"],
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
        sources: ["https://docs.zencoder.ai/llms-full.txt"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM cannot yet model the dotted zencoder.mcpServers VS Code settings key, and the previous standalone .zencoder/mcp.json target was not vendor-documented.",
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Zencoder custom agents are created, selected, and shared through its UI; the current catalog schema cannot represent that native UI-only surface as a subagent install target.",
        docs: [],
        sources: ["https://docs.zencoder.ai/llms-full.txt"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has no delivery path for Zencoder's UI-managed custom agents.",
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
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://docs.zencoder.ai/llms-full.txt"],
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: false,
      importSyntax: null,
      directory: ".zencoder/rules",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Zencoder added MCP tool permission prompts in April 2026. The docs describe user-visible MCP permission control, not a stable AXM-writable permission file.",
      docs: [],
      sources: ["https://docs.zencoder.ai/llms-full.txt"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Zencoder permission grant writer.",
    },
  },
} as const satisfies Agent;
