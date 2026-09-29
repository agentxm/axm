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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".qoder/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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

        locations: [],

        entryDialect: null,
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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".qoder/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
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

        locations: [],

        entryDialect: null,
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
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".qoder-cn/settings.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "json",
          gitignored: false,
        },
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".qoder/settings.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "json",
          gitignored: false,
        },
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
