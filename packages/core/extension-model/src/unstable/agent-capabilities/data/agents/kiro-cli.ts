import type { Agent } from "../../schema.js";
export const kiroCliAgent = {
  id: "kiro-cli",
  name: "Kiro CLI",
  vendor: "AWS",
  homepage: "https://kiro.dev",
  interfaces: ["cli"],
  family: "amazon",
  rootDir: ".kiro",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Kiro CLI documentation",
      url: "https://kiro.dev/docs/cli/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://kiro.dev/docs/cli/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".kiro/skills",
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
        sources: ["https://kiro.dev/docs/mcp/configuration/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },

        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".kiro/settings/mcp.json",
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
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".kiro/settings/mcp.json",
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
            attribution: "agent",
          },
        ],

        entryDialect: {
          activationField: {
            required: { name: "disabled", enabled: false, disabled: true },
            accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
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
            locationIds: ["project", "user"],
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: [
          "https://kiro.dev/docs/cli/custom-agents/configuration-reference/",
          "https://kiro.dev/docs/custom-agents/configuration-reference/",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".kiro/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".kiro/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://kiro.dev/docs/custom-agents/configuration-reference/"],
          conditions: [
            "Legacy CLI 2.x agent files remain visible and can be upgraded with /upgrade-agent.",
          ],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Full V3 permission and MCP dialects were not revalidated.",
          ],
          claimScope: "V3 custom agent configuration and project/home discovery",
        },
      },
      axm: {
        status: "unsupported",
        reason: "Native ownership is unverified.",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Kiro custom agent configuration V3 requires a hooks array. Legacy CLI 2.x hook objects are migrated by /upgrade-agent; AXM has no Kiro hook writer.",
        docs: [],
        sources: [
          "https://kiro.dev/docs/cli/hooks/",
          "https://kiro.dev/docs/cli/custom-agents/configuration-reference/",
          "https://kiro.dev/docs/custom-agents/configuration-reference/",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://kiro.dev/docs/custom-agents/configuration-reference/"],
          conditions: ["V3 requires hook arrays; /upgrade-agent migrates CLI 2.x hook objects."],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "V3 hook array migration from legacy object form",
        },
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented a Kiro CLI hooks writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Kiro CLI steering files live under .kiro/steering and can be always-on, conditional, or manually referenced.",
      docs: [],
      sources: ["https://kiro.dev/docs/cli/steering/"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      locations: [
        {
          scope: "project",
          root: "project",
          path: ".kiro/steering",
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Kiro CLI custom agent configuration supports allowedTools, toolsSettings, and the hooks/MCP tools settings surfaces. The public docs do not define a single default AXM-writable permission grant target.",
      docs: [],
      sources: [
        "https://kiro.dev/docs/cli/custom-agents/configuration-reference/",
        "https://kiro.dev/docs/cli/",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".kiro/agents/*.json",
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
          id: "user",
          scope: "user",
          root: "home",
          path: ".kiro/agents/*.json",
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
      grammar: {
        style: "tool-call",
        example: 'allowedTools: ["Read", "Write", "Bash"]',
        notes: "Permission rules are embedded in custom agent configuration files.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Kiro CLI custom-agent permission grant writer.",
    },
  },

  profile: {
    identity: {
      product: "Kiro CLI",
      surface: "Kiro CLI custom agent configuration V3",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://kiro.dev/docs/custom-agents/configuration-reference/"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, instructions, permissions.",
      ],
      claimScope: "Versioned custom-agent configuration and hook migration",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
