import type { Agent } from "../../schema.js";
export const iflowCliAgent = {
  id: "iflow-cli",
  name: "iFlow CLI",
  vendor: "XinLiu AI",
  homepage: "https://platform.iflow.cn/cli",
  interfaces: ["cli"],
  family: null,
  rootDir: ".iflow",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".iflow", signal: "definitive", note: null }] },
    user: {
      markers: [
        { kind: "executable", name: "iflow", signal: "definitive", note: null },
        { kind: "dir", path: "~/.iflow", signal: "definitive", note: null },
      ],
    },
  },
  docs: [{ label: "iFlow CLI documentation", url: "https://platform.iflow.cn/en/cli/quickstart" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://platform.iflow.cn/en/cli/examples/skill"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".iflow/skills",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "iFlow CLI supports CLI-managed and JSON-configured MCP servers at user and project scopes.",
        docs: [],
        sources: ["https://platform.iflow.cn/en/cli/examples/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "The vendor docs name both settings and legacy MCP files; AXM has not verified one lossless writer dialect across them.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://platform.iflow.cn/en/cli/examples/subagent"],
        scopes: ["user", "project"],
        directory: ".iflow/agents",
        layout: "directory",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "iFlow documents command hooks at user and project scopes, but AXM has not modeled the event and serialization contract.",
        docs: [],
        sources: ["https://platform.iflow.cn/en/cli/examples/hooks"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented the iFlow hook dialect.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://platform.iflow.cn/en/cli/configuration/iflow"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "own-file",
      files: ["IFLOW.md"],
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
        "iFlow exposes confirmation and YOLO execution modes, but vendor docs do not define stable granular permission files for AXM.",
      docs: [],
      sources: ["https://platform.iflow.cn/en/cli/quickstart"],
      scopes: ["user"],
      mechanism: ["cli-flag", "ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [
        { flag: "--yolo", note: "Allow tool execution without per-operation confirmation." },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM does not emit broad bypass flags as permission grants.",
    },
  },
} as const satisfies Agent;
