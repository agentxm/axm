import type { Agent } from "../../schema.js";
export const traeCnAgent = {
  id: "trae-cn",
  name: "Trae CN",
  vendor: "ByteDance",
  homepage: "https://www.trae.cn",
  interfaces: ["ide-extension"],
  family: "bytedance",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Trae CN documentation",
      url: "https://docs.trae.cn",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.trae.cn/ide/skills"],
        scopes: ["project", "user"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".trae/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.trae.cn/ide_add-mcp-servers"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },

        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".trae/mcp.json",
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
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
        ],

        entryDialect: {
          activationField: {
            required: null,
            accepted: [null],
          },
          stdio: {
            typeField: { required: null, accepted: [null] },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: { required: null, accepted: [null] },
            urlKey: {
              "streamable-http": "url",
              sse: "url",
            },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            locationIds: ["project"],
          },
        },
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://docs.trae.cn/ide/rules"],
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      locations: [
        {
          scope: "project",
          root: "project",
          path: ".trae/rules",
          shape: "directory",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
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
      product: "Trae CN",
      surface: "TRAE CN IDE; TraeWork is a separate reviewed surface",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://docs.trae.cn/work_skills"],
      conditions: [
        "TraeWork documentation describes .trae/skills locally and ~/.trae-cn/skills globally plus uploads; it does not establish the existing IDE reader contract.",
      ],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "TraeWork skill discovery; IDE capability details remain unreviewed",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
