import type { Agent } from "../../schema.js";

export const geminiAppAgent = {
  id: "gemini-app",
  name: "Gemini app",
  vendor: "Google",
  homepage: "https://gemini.google.com",
  interfaces: ["chat", "hosted-agent"],
  family: "gemini",
  profile: {
    identity: {
      product: "Gemini",
      surface: "Hosted chat",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://support.google.com/gemini/answer/17094296?co=GENIE.Platform%3DDesktop&hl=en",
      ],
      conditions: [],
      limitations: [
        "Skills apply to ordinary chats and Spark; personal-account rollout is staged and excludes work/school accounts.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: null,
  installTarget: {
    kind: "hosted",
    delivery: ["upload"],
    artifact: "skill-file-or-zip",
    instructions:
      "Run axm lint to validate the skill, then open Gemini Settings > Skills and upload its SKILL.md or a ZIP with SKILL.md at the root.",
    docs: "https://support.google.com/gemini/answer/17094296?hl=en",
  },
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [],
    },
    user: {
      markers: [],
    },
  },
  docs: [
    {
      label: "Create and manage skills for Gemini Apps",
      url: "https://support.google.com/gemini/answer/17094296?hl=en",
    },
    {
      label: "Connected Apps in Gemini",
      url: "https://support.google.com/gemini/answer/13695044?co=GENIE.Platform%3DDesktop&hl=en",
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
        notes:
          "Skills work in ordinary Gemini chats and Spark. Availability is rolling out to personal Google accounts; work and school accounts are not supported.",
        docs: [],
        sources: ["https://support.google.com/gemini/answer/17094296?hl=en"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://support.google.com/gemini/answer/17094296?co=GENIE.Platform%3DDesktop&hl=en",
          ],
          claimScope: "Skills eligibility, upload shape, and chat/Spark availability",
          conditions: ["Available personal-account rollout; not work or school accounts."],
          limitations: [],
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
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
          "Gemini Spark accepts remote MCP server URLs as custom Connected Apps; Spark eligibility restrictions apply.",
        docs: [],
        sources: [
          "https://support.google.com/gemini/answer/13695044?co=GENIE.Platform%3DDesktop&hl=en",
        ],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
        transports: ["http"],
        locations: [],
        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        reason: "Gemini Connected App setup is hosted and UI-mediated.",
        writer: null,
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
        notes: "No scoped primary-source evidence establishes absence of this capability.",
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
        availability: {
          via: "unknown",
        },
        vendorStatus: {
          state: "active",
        },
        notes: "No scoped primary-source evidence establishes absence of this capability.",
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
      availability: {
        via: "unknown",
      },
      vendorStatus: {
        state: "active",
      },
      notes: "No scoped primary-source evidence establishes absence of this capability.",
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
      availability: {
        via: "unknown",
      },
      vendorStatus: {
        state: "active",
      },
      notes: "No scoped primary-source evidence establishes absence of this capability.",
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
