import type { Agent } from "../../schema.js";

export const museCodeAgent = {
  id: "muse-code",
  name: "Muse Code",
  vendor: "Meta",
  homepage: "https://dev.meta.ai/docs/muse-code",
  interfaces: ["cli"],
  family: null,
  profile: {
    identity: {
      product: "Muse Code",
      surface: "cli",
      edition: null,
      ownership: null,
      modelProviders: ["Meta"],
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://dev.meta.ai/docs/muse-code",
        "https://dev.meta.ai/docs/muse-code/extending",
      ],
      claimScope: "Product identity, delivery surface and cited extension documentation",
      conditions: [],
      limitations: ["No vendor runtime session was executed."],
    },
    lifecycleQualifications: [],
  },
  rootDir: null,
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [],
    },
    user: {
      markers: [
        {
          kind: "executable",
          name: "muse",
          signal: "definitive",
          note: null,
        },
      ],
    },
  },
  docs: [
    {
      label: "Official documentation",
      url: "https://dev.meta.ai/docs/muse-code",
    },
    {
      label: "Extension reference",
      url: "https://dev.meta.ai/docs/muse-code/extending",
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
        sources: ["https://dev.meta.ai/docs/muse-code/extending"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://dev.meta.ai/docs/muse-code/extending"],
          claimScope: "Skill discovery roots and standard SKILL.md format",
          conditions: ["Project skills require a trusted workspace."],
          limitations: [],
        },
        scopes: ["project", "user"],
        standardsCompliance: "full",
        convention: "universal",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
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
            path: "muse/skills",
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
          "User settings.json contains mcp_servers with stdio and streamable_http transports; required/optional modes affect startup. AXM does not write this settings dialect.",
        docs: [],
        sources: ["https://dev.meta.ai/docs/muse-code/extending"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://dev.meta.ai/docs/muse-code/extending"],
          claimScope: "Documented native capability; AXM grammar remains unverified",
          conditions: [],
          limitations: [],
        },
        scopes: ["user"],
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
    hook: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Command hooks use project .muse/hooks.json, user settings and managed policy; trust and managed precedence apply.",
        docs: [],
        sources: ["https://dev.meta.ai/docs/muse-code/extending"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://dev.meta.ai/docs/muse-code/extending"],
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
      sources: ["https://dev.meta.ai/docs/muse-code/configuration"],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://dev.meta.ai/docs/muse-code/configuration"],
        claimScope: "Instruction discovery and precedence",
        conditions: [
          "Project instructions require a trusted workspace; at each level the first supported instruction filename wins.",
        ],
        limitations: [],
      },
      scopes: ["project"],
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
        "Muse configures permission profiles, sandbox and approval modes through settings and launch flags. Managed policy and workspace trust still apply; AXM does not grant access.",
      docs: [],
      sources: ["https://dev.meta.ai/docs/muse-code/configuration"],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://dev.meta.ai/docs/muse-code/configuration"],
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
