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
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "The vendor CLI source and documentation do not implement skills or read .codemaker/skills; the prior claim came only from a third-party installer path table. Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
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
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Codemaker",
      surface: "CodeMaker AI CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://github.com/codemakerai/codemaker-cli"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "CLI product identity; extension availability remains unresolved",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
