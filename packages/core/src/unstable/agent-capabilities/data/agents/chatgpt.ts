import type { Agent } from "../../schema.js";

export const chatgptAgent = {
  id: "chatgpt",
  name: "ChatGPT",
  vendor: "OpenAI",
  homepage: "https://chatgpt.com",
  interfaces: ["chat", "hosted-agent"],
  family: "openai",
  rootDir: null,
  installTarget: {
    kind: "hosted",
    delivery: ["upload"],
    artifact: "directory",
    instructions:
      "Run axm lint to validate the skill directory, then choose Plugins > Skills > Create > Upload from your computer in ChatGPT.",
    docs: "https://help.openai.com/en/articles/20001066-skills-in-chatgpt",
  },
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Personal Skills use the Agent Skills open standard and are uploaded separately on desktop and web/mobile. Plan and administrator controls apply.",
        docs: [],
        sources: ["https://help.openai.com/en/articles/20001066-skills-in-chatgpt"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
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
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "ChatGPT app action permissions and confirmations are managed in the hosted UI.",
      docs: [],
      sources: [
        "https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta",
      ],
      scopes: ["user"],
      mechanism: ["ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
} as const satisfies Agent;
