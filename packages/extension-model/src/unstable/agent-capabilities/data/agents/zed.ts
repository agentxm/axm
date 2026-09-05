import type { Agent } from "../../schema.js";
export const zedAgent = {
  id: "zed",
  name: "Zed",
  vendor: "Zed Industries",
  homepage: "https://zed.dev",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".zed",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".zed", signal: "supporting", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.config/zed", signal: "definitive", note: null }] },
  },
  docs: [{ label: "Zed Agent documentation", url: "https://zed.dev/docs/ai/zed-agent" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Because Zed's project Skill directory is .agents/skills, --agent universal already wrote to the correct location; this entry adds Zed-specific detection and naming.",
        docs: [],
        sources: ["https://zed.dev/docs/ai/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Zed configures context servers in settings; AXM has not modeled the Zed settings dialect.",
        docs: [],
        sources: ["https://zed.dev/docs/ai/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented a Zed settings writer for context servers.",
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
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", writer: null, lastVerified: null },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://zed.dev/docs/ai/instructions"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Zed exposes tool permissions through agent settings and prompts; AXM does not model that settings surface.",
      docs: [],
      sources: ["https://zed.dev/docs/ai/tool-permissions"],
      scopes: ["user", "project"],
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
      reason: "AXM has not implemented Zed tool-permission settings.",
    },
  },
} as const satisfies Agent;
