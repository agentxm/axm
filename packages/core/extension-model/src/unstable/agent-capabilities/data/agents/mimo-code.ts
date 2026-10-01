import type { Agent } from "../../schema.js";

export const mimoCodeAgent = {
  id: "mimo-code",
  name: "MiMo Code",
  vendor: "Xiaomi",
  homepage: "https://mimo.xiaomi.com",
  interfaces: ["cli", "desktop"],
  family: null,
  profile: {
    identity: {
      product: "MiMo Code",
      surface: "CLI; desktop beta embeds the engine",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://github.com/XiaomiMiMo/MiMo-Code"],
      claimScope: "Product identity, delivery surface and cited extension documentation",
      conditions: ["CLI projections do not establish desktop beta behavior."],
      limitations: ["No vendor runtime session was executed."],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".mimocode",
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [
        {
          kind: "dir",
          path: ".mimocode",
          signal: "supporting",
          note: null,
        },
      ],
    },
    user: {
      markers: [
        {
          kind: "executable",
          name: "mimo",
          signal: "definitive",
          note: null,
        },
      ],
    },
  },
  docs: [
    {
      label: "Official documentation",
      url: "https://github.com/XiaomiMiMo/MiMo-Code",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes: null,
        docs: [],
        sources: ["https://github.com/XiaomiMiMo/MiMo-Code"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://github.com/XiaomiMiMo/MiMo-Code"],
          claimScope: "Skill discovery roots and standard SKILL.md format",
          conditions: [],
          limitations: [],
        },
        scopes: ["project", "user"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".mimocode/skills",
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
            root: "xdg-config",
            path: "mimocode/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Default XDG configuration only; MIMOCODE_HOME and Windows path overrides are not resolved by AXM.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: null,
        verification: {
          verifiedAt: "2026-10-01",
          boundary: "configuration",
          evidence: [
            "specification:cli/skills/new/scaffolds-for-every-configured-agent",
            "packages/core/workspace-kernel/src/agent-adapters/agents/scoped-native-readers.spec.ts",
          ],
          limitations: [
            "Project-scope skill scaffolding and native reader resolution were exercised in isolated filesystems. This does not execute the vendor agent or establish user-scope runtime discovery.",
          ],
        },
      },
    },
    "mcp-server": {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "JSON/JSONC mcp entries use local command arrays or remote URL entries. MIMOCODE_HOME and platform roots change discovery; AXM has not verified the complete writer contract.",
        docs: [],
        sources: [
          "https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/mcp.ts",
          "https://github.com/XiaomiMiMo/MiMo-Code",
        ],
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/mcp.ts",
            "https://github.com/XiaomiMiMo/MiMo-Code",
          ],
          claimScope: "Documented native capability; AXM grammar remains unverified",
          conditions: [],
          limitations: [],
        },
        scopes: ["project", "user"],
        modeling: "native-unmodeled",
        locations: [],
        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has no verified writer for this native configuration dialect.",
      },
    },
    subagent: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Native metadata is passed through. MiMo expects native model, mode, permission and tool fields; AXM does not translate another vendor's tool grammar.",
        docs: [],
        sources: [
          "https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/agent.ts",
        ],
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/agent.ts",
          ],
          claimScope: "Markdown custom-agent discovery and native frontmatter",
          conditions: [],
          limitations: [],
        },
        scopes: ["project", "user"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".mimocode/agents",
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
            root: "xdg-config",
            path: "mimocode/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Default XDG configuration only; MIMOCODE_HOME and Windows path overrides are not resolved by AXM.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: null,
        verification: {
          verifiedAt: "2026-10-01",
          boundary: "configuration",
          evidence: ["specification:workspace/subagents/native-locations-respect-shape-and-proof"],
          limitations: [
            "Project-scope filesystem behavior was exercised without executing the vendor runtime. User-scope behavior is not established by this check.",
          ],
        },
      },
    },
    hook: {
      native: {
        availability: {
          via: "unknown",
        },
        vendorStatus: {
          state: "active",
        },
        notes: "No scoped evidence establishes a reusable extension target for this capability.",
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No verified native extension target or AXM projection is recorded.",
      },
    },
  },
  instructions: {
    native: {
      availability: {
        via: "unknown",
      },
      vendorStatus: {
        state: "active",
      },
      notes: "No scoped evidence establishes a reusable extension target for this capability.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "No verified native extension target or AXM projection is recorded.",
    },
  },
  permissions: {
    native: {
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes:
        "MiMo has native permission configuration including per-agent policy; outside-workspace access requires approval by default. AXM does not translate permission grammars.",
      docs: [],
      sources: [
        "https://github.com/XiaomiMiMo/MiMo-Code",
        "https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/agent.ts",
      ],
      review: {
        reviewedAt: "2026-10-01",
        sources: [
          "https://github.com/XiaomiMiMo/MiMo-Code",
          "https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/cli/src/config/agent.ts",
        ],
        claimScope:
          "Presence of native permission controls; grammar and unattended behavior not verified",
        conditions: [],
        limitations: ["No permission changes or vendor execution were performed."],
      },
      scopes: ["project", "user"],
      mechanism: ["config-file"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has no verified permission-grant adapter for this target.",
    },
  },
} as const satisfies Agent;
