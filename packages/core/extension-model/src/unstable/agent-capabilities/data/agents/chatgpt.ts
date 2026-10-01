import type { Agent } from "../../schema.js";

export const chatgptAgent = {
  id: "chatgpt",
  name: "ChatGPT",
  vendor: "OpenAI",
  homepage: "https://chatgpt.com",
  interfaces: ["chat", "hosted-agent"],
  family: "openai",
  profile: {
    identity: {
      product: "ChatGPT",
      surface: "Hosted chat and workspace",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://learn.chatgpt.com/docs/build-skills",
        "https://learn.chatgpt.com/docs/enterprise/skills",
      ],
      claimScope: "Standalone skills versus hosted workspace and plugin delivery",
      conditions: ["Workspace plan and administrator controls apply."],
      limitations: [
        "The standalone filesystem skill path is represented by the Codex target. No upload or hosted runtime was exercised.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: null,
  installTarget: {
    kind: "hosted",
    delivery: ["upload"],
    artifact: "directory",
    instructions:
      "Validate the skill with axm lint. Use ChatGPT workspace skill administration for an eligible workspace, or package it in a ChatGPT plugin for web/mobile distribution; AXM does not upload or publish it.",
    docs: "https://learn.chatgpt.com/docs/enterprise/skills",
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
      label: "Skills in ChatGPT",
      url: "https://help.openai.com/en/articles/20001066-skills-in-chatgpt",
    },
    {
      label: "Developer mode and MCP apps in ChatGPT",
      url: "https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta",
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
          "Standalone skills are documented for desktop, Codex CLI and IDE; web/mobile reuse skills through plugins. Workspace-managed skills have separate availability and administrator controls.",
        docs: [],
        sources: [
          "https://learn.chatgpt.com/docs/build-skills",
          "https://learn.chatgpt.com/docs/enterprise/skills",
        ],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://learn.chatgpt.com/docs/build-skills",
            "https://learn.chatgpt.com/docs/enterprise/skills",
          ],
          claimScope: "Delivery surface distinction",
          conditions: [
            "Hosted distribution depends on workspace administration or plugin packaging.",
          ],
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
          "ChatGPT developer mode accepts remote MCP servers for custom apps; plan, role, and administrator controls apply.",
        docs: [],
        sources: [
          "https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta",
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
        reason: "ChatGPT connector setup is hosted and UI-mediated.",
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
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes: "ChatGPT app action permissions and confirmations are managed in the hosted UI.",
      docs: [],
      sources: [
        "https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta",
      ],
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
    },
  },
} as const satisfies Agent;
