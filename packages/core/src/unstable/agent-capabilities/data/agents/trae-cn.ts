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
        directory: ".trae/skills",
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
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            serversKey: "mcpServers",
            activationField: {
              required: null,
              accepted: [null],
            },
            targets: [
              {
                scope: "project",
                path: ".trae/mcp.json",
                format: "json",
              },
            ],
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://docs.trae.cn/ide/rules"],
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: true,
      importSyntax: null,
      directory: ".trae/rules",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
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
