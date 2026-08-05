import type { Agent } from "../../schema.js";
export const codemakerAgent = {
  id: "codemaker",
  name: "Codemaker",
  vendor: "CodeMaker AI",
  homepage: "https://github.com/codemakerai/codemaker-cli",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: null,
  lifecycle: {
    state: "retired",
    since: null,
    note: "CodeMaker AI's vendor domains no longer resolve, and its vendor-owned CLI repository has not shipped an agent-extension surface.",
    supersededBy: null,
  },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.codemaker", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "CodeMaker CLI repository",
      url: "https://github.com/codemakerai/codemaker-cli",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "The vendor CLI source and documentation do not implement skills or read .codemaker/skills; the prior claim came only from a third-party installer path table.",
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
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
