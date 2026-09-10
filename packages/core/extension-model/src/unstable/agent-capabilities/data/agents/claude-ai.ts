import type { Agent } from "../../schema.js";

export const claudeAiAgent = {
  id: "claude-ai",
  name: "Claude.ai",
  vendor: "Anthropic",
  homepage: "https://claude.ai",
  interfaces: ["chat"],
  family: "claude",
  rootDir: null,
  installTarget: {
    kind: "hosted",
    delivery: ["upload", "directory"],
    artifact: "zip",
    instructions:
      "Run axm lint to validate the skill, package its folder as a ZIP, then use Customize > Skills > Create skill > Upload a skill in Claude.",
    docs: "https://support.claude.com/en/articles/12512180-use-skills-in-claude",
  },
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [
    {
      label: "Use skills in Claude",
      url: "https://support.claude.com/en/articles/12512180-use-skills-in-claude",
    },
    {
      label: "Remote MCP custom connectors",
      url: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Claude accepts custom skill folders packaged as ZIP files. Account, organization, and code-execution controls apply; enabled skills are shared with Cowork.",
        docs: [],
        sources: ["https://support.claude.com/en/articles/12512180-use-skills-in-claude"],
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
        notes: "Claude accepts publicly reachable remote MCP servers as custom connectors.",
        docs: [],
        sources: [
          "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
        ],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
        transports: ["http"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        reason: "Claude connector setup is hosted and UI-mediated.",
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: "Plugin subagents run in Cowork, not in Claude chat.",
        docs: [],
        sources: ["https://support.claude.com/en/articles/13837440-use-plugins-in-claude"],
      },
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: "Plugin hooks run in Cowork, not in Claude chat.",
        docs: [],
        sources: ["https://support.claude.com/en/articles/13837440-use-plugins-in-claude"],
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
