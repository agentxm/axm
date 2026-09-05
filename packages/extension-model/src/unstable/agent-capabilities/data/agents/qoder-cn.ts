import type { Agent } from "../../schema.js";
export const qoderCnAgent = {
  id: "qoder-cn",
  name: "Qoder CN CLI",
  vendor: "Alibaba Cloud",
  homepage: "https://help.aliyun.com/zh/lingma/qoder-cn-cli",
  interfaces: ["cli"],
  family: "alibaba",
  rootDir: ".qoder",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".qoder", signal: "definitive", note: null }] },
    user: {
      markers: [
        { kind: "executable", name: "qoderclicn", signal: "definitive", note: null },
        { kind: "dir", path: "~/.qoder-cn", signal: "definitive", note: null },
      ],
    },
  },
  docs: [
    { label: "Qoder CN CLI documentation", url: "https://help.aliyun.com/zh/lingma/qoder-cn-cli" },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://help.aliyun.com/en/lingma/skills-3033419",
          "https://help.aliyun.com/zh/lingma/qoder-cn-cli",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".qoder/skills",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Qoder CN CLI stores user, local-project, and shared-project MCP definitions in distinct settings files.",
        docs: [],
        sources: ["https://help.aliyun.com/zh/lingma/mcp-servers"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not verified the Qoder CN CLI dialect independently from global Qoder.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://help.aliyun.com/en/lingma/subagent"],
        scopes: ["user", "project"],
        directory: ".qoder/agents",
        layout: "directory",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Qoder CN CLI exposes command hooks, but AXM has not independently verified its complete event and serialization contract.",
        docs: [],
        sources: ["https://help.aliyun.com/zh/lingma/qoder-cn-cli"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason:
          "The regional CLI hook dialect requires a separate vendor-doc verification before AXM writes it.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://help.aliyun.com/zh/lingma/using-the-cli"],
      scopes: ["user", "project"],
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
      notes: "Qoder CN CLI supports allow, ask, and deny rules plus session flags.",
      docs: [],
      sources: ["https://help.aliyun.com/zh/lingma/tools-3044418"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        { scope: "user", path: "~/.qoder-cn/settings.json", format: "json", gitignored: false },
        { scope: "project", path: ".qoder/settings.json", format: "json", gitignored: false },
      ],
      grammar: { style: "glob", example: "Bash(git status)", notes: null },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--allowed-tools",
          note: "Pre-allow named tools or tool patterns for the session.",
        },
        {
          flag: "--disallowed-tools",
          note: "Deny named tools or tool patterns for the session.",
        },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented regional Qoder permission settings.",
    },
  },
} as const satisfies Agent;
