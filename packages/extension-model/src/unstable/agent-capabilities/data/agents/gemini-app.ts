import type { Agent } from "../../schema.js";

export const geminiAppAgent = {
  id: "gemini-app",
  name: "Gemini app",
  vendor: "Google",
  homepage: "https://gemini.google.com",
  interfaces: ["chat", "hosted-agent"],
  family: "gemini",
  rootDir: null,
  installTarget: {
    kind: "hosted",
    delivery: ["upload"],
    artifact: "skill-file-or-zip",
    instructions:
      "Run axm lint to validate the skill, then in Gemini Spark choose Skills > Upload and select its SKILL.md file or a ZIP with SKILL.md at the root.",
    docs: "https://support.google.com/gemini/answer/17094296?hl=en",
  },
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Gemini Spark accepts a SKILL.md file or a ZIP with SKILL.md at its root. Subscription, region, language, and surface restrictions apply.",
        docs: [],
        sources: ["https://support.google.com/gemini/answer/17094296?hl=en"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
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
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", writer: null, lastVerified: null },
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
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
} as const satisfies Agent;
