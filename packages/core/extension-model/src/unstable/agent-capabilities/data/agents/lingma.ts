import type { Agent } from "../../schema.js";
export const lingmaAgent = {
  id: "lingma",
  name: "Lingma",
  vendor: "Alibaba Cloud",
  homepage: "https://help.aliyun.com/zh/lingma",
  interfaces: ["ide-extension"],
  family: "alibaba",
  rootDir: ".lingma",
  lifecycle: {
    state: "deprecated",
    since: "2026-05-20",
    note: "Alibaba renamed TONGYI Lingma to Qoder CN.",
    supersededBy: "qoder-cn",
  },
  detection: {
    project: { markers: [{ kind: "dir", path: ".lingma", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.lingma", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Qoder CN (formerly Lingma) documentation",
      url: "https://help.aliyun.com/en/lingma/introduction-of-lingma",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "deprecated",
          since: "2026-05-20",
          note: "The Lingma product name was replaced by Qoder CN.",
          supersededByType: null,
        },
        notes: null,
        docs: [],
        sources: ["https://help.aliyun.com/en/lingma/qoder-cn/user-guide/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".lingma/skills",
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
        vendorStatus: {
          state: "deprecated",
          since: "2026-05-20",
          note: "The Lingma product name was replaced by Qoder CN.",
          supersededByType: null,
        },
        notes:
          "The IDE reads MCP services from its settings file; AXM has no verified writer for the legacy Lingma surface.",
        docs: [],
        sources: ["https://help.aliyun.com/en/lingma/qoder-cn/user-guide/guide-for-using-mcp"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "sse"],

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented the legacy Lingma IDE settings dialect.",
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: {
          state: "deprecated",
          since: "2026-05-20",
          note: "The Lingma product name was replaced by Qoder CN.",
          supersededByType: null,
        },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "deprecated",
          since: "2026-05-20",
          note: "The Lingma product name was replaced by Qoder CN.",
          supersededByType: null,
        },
        notes: "Lingma/Qoder CN IDE command hooks are documented in ~/.lingma/settings.json.",
        docs: [],
        sources: ["https://help.aliyun.com/zh/lingma/qoder-cn/user-guide/hooks"],
        scopes: ["user"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented the Lingma IDE hook dialect.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "none" },
      vendorStatus: {
        state: "deprecated",
        since: "2026-05-20",
        note: "The Lingma product name was replaced by Qoder CN.",
        supersededByType: null,
      },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: {
        state: "deprecated",
        since: "2026-05-20",
        note: "The Lingma product name was replaced by Qoder CN.",
        supersededByType: null,
      },
      notes:
        "The IDE exposes Auto-Run controls in settings rather than a documented portable rule grammar.",
      docs: [],
      sources: ["https://help.aliyun.com/zh/lingma/qoder-cn/user-guide/agent"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM cannot write UI-only Lingma Auto-Run settings.",
    },
  },
} as const satisfies Agent;
