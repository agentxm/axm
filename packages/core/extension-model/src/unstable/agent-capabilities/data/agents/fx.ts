import type { Agent } from "../../schema.js";

export const fxAgent = {
  id: "fx",
  name: "FX",
  vendor: "Vercel Labs",
  homepage: "https://fx.sh",
  interfaces: ["cli", "embedded"],
  family: null,
  profile: {
    identity: {
      product: "FX",
      surface: "cli, embedded",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://github.com/vercel-labs/fx", "https://fx.sh/docs"],
      claimScope: "Product identity, delivery surface and cited extension documentation",
      conditions: [
        "Filesystem projections target the CLI; embedded and ACP hosts have separate configuration lifetimes.",
      ],
      limitations: ["No vendor runtime session was executed."],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".fx",
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [
        {
          kind: "dir",
          path: ".fx",
          signal: "supporting",
          note: null,
        },
      ],
    },
    user: {
      markers: [
        {
          kind: "executable",
          name: "fx",
          signal: "definitive",
          note: null,
        },
      ],
    },
  },
  docs: [
    {
      label: "Official documentation",
      url: "https://github.com/vercel-labs/fx",
    },
    {
      label: "Extension reference",
      url: "https://fx.sh/docs",
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
        sources: ["https://fx.sh/docs/capabilities/skills"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://fx.sh/docs/capabilities/skills"],
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
            path: ".fx/skills",
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
            path: ".fx/skills",
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
          "Project .mcp.json uses mcpServers and requires workspace approval; user ~/.fx/mcp.json uses mcp. Profile strings are literal and Authorization headers require environment-backed fields. AXM has not verified these distinct dialects.",
        docs: [],
        sources: [
          "https://fx.sh/docs/capabilities/mcp",
          "https://fx.sh/docs/capabilities/mcp/protocol",
        ],
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://fx.sh/docs/capabilities/mcp",
            "https://fx.sh/docs/capabilities/mcp/protocol",
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
          via: "unknown",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "FX supports session subagents. The reviewed documentation does not establish a reusable custom-agent file target.",
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
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes: null,
      docs: [],
      sources: ["https://fx.sh/docs/configure-fx/project-instructions"],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://fx.sh/docs/configure-fx/project-instructions"],
        claimScope: "Instruction discovery and precedence",
        conditions: ["Instruction context must be enabled in FX settings."],
        limitations: [],
      },
      scopes: ["project", "user"],
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
          path: ".fx/AGENTS.md",
          shape: "file",
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
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: null,
      writer: null,
      verification: {
        verifiedAt: "2026-10-01",
        boundary: "configuration",
        evidence: [
          "specification:workspace/instructions/respects-native-authority-and-observation",
        ],
        limitations: [
          "Project-scope filesystem behavior was exercised without executing the vendor runtime. User-scope behavior is not established by this check.",
        ],
      },
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
        "Persistent permission rules live only in ~/.fx/settings.json, with global and workspace profiles; project .fx.json cannot define them. CLI permission-mode flags govern a run. AXM does not modify these policies.",
      docs: [],
      sources: ["https://fx.sh/docs/configure-fx/permissions"],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://fx.sh/docs/configure-fx/permissions"],
        claimScope:
          "Presence of native permission controls; grammar and unattended behavior not verified",
        conditions: [],
        limitations: ["No permission changes or vendor execution were performed."],
      },
      scopes: ["user"],
      mechanism: ["config-file", "cli-flag"],
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
