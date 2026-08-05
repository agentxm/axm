import type { Agent } from "../../schema.js";

const claudePlugin = {
  name: "Claude plugins",
  homepage: "https://support.claude.com/en/articles/13837440-use-plugins-in-claude",
  author: "Anthropic",
  distribution: {
    mechanism: "agent-native",
    installHint: "Install or upload the plugin from Customize > Plugins in Cowork.",
    packageRef: null,
  },
  detection: null,
} as const;

export const coworkAgent = {
  id: "cowork",
  name: "Claude Cowork",
  vendor: "Anthropic",
  homepage: "https://claude.ai",
  interfaces: ["hosted-agent"],
  family: "claude",
  rootDir: null,
  installTarget: {
    kind: "hosted",
    delivery: ["upload", "directory"],
    artifact: "zip",
    instructions:
      "Run axm lint to validate the skill, package its folder as a ZIP, then use Customize > Skills in Cowork to upload it or install a shared skill from the directory.",
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
      label: "Use plugins in Claude",
      url: "https://support.claude.com/en/articles/13837440-use-plugins-in-claude",
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
          "Cowork uses the Claude account's custom and shared skills, which are uploaded as ZIP-packaged skill folders or installed from an organization directory.",
        docs: [],
        sources: ["https://support.claude.com/en/articles/12512180-use-skills-in-claude"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "hosted",
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
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
          "Cowork uses Claude account connectors backed by publicly reachable remote MCP servers.",
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
        reason: "Cowork connector setup is hosted and UI-mediated.",
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "plugin", provider: "first-party", plugin: claudePlugin },
        vendorStatus: { state: "active" },
        notes: "Claude plugins can bundle subagents, which run only in Cowork.",
        docs: [],
        sources: ["https://support.claude.com/en/articles/13837440-use-plugins-in-claude"],
        scopes: ["user"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        reason: "Cowork plugin installation is hosted and UI-mediated.",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "plugin", provider: "first-party", plugin: claudePlugin },
        vendorStatus: { state: "active" },
        notes: "Claude plugin hooks run only in Cowork; event mechanics are not cataloged yet.",
        docs: [],
        sources: ["https://support.claude.com/en/articles/13837440-use-plugins-in-claude"],
        scopes: ["user"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        reason: "Cowork plugin hooks have no AXM writer.",
        writer: null,
      },
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
