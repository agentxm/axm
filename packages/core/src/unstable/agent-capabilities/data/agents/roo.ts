import type { Agent } from "../../schema.js";
export const rooAgent = {
  id: "roo",
  name: "Roo Code",
  vendor: "Roo Code",
  homepage: "https://roocode.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".roo",
  lifecycle: {
    state: "retired",
    since: "2026-05-15",
    note: "Roo Code shut down its VS Code extension, Cloud, and Router on 2026-05-15 (final release v3.54.0); the RooCodeInc/Roo-Code repo is archived and read-only. The former team pivoted to a separate cloud-agent product, Roomote.",
    supersededBy: null,
  },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Roo Code documentation",
      url: "https://docs.roocode.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "removed",
          since: "2026-05-15",
          note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
          supersededByType: null,
        },
        notes:
          "Roo Code supports Roo-specific .roo/skills and cross-agent .agents/skills locations, including mode-specific skill directories.",
        docs: [],
        sources: ["https://docs.roocode.com/features/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".roo/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "removed",
          since: "2026-05-15",
          note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
          supersededByType: null,
        },
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.roocode.com/features/slash-commands"],
        scopes: ["user", "project"],
        directory: ".roo/commands",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "removed",
          since: "2026-05-15",
          note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
          supersededByType: null,
        },
        notes: null,
        docs: [],
        sources: ["https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-06-06",
        writer: null,
        reason: "The current AXM Roo Code service returns MCP add/remove as unsupported.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: {
          state: "removed",
          since: "2026-05-15",
          note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
          supersededByType: null,
        },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://docs.roocode.com/features/custom-modes"],
        scopes: ["user", "project"],
        directory: ".roomodes",
        layout: "file",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: {
          state: "removed",
          since: "2026-05-15",
          note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
          supersededByType: null,
        },
        notes: null,
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
      availability: { via: "native" },
      vendorStatus: {
        state: "removed",
        since: "2026-05-15",
        note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
        supersededByType: null,
      },
      notes:
        "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella; Roo also loads AGENTS.md when agent rules are enabled.",
      docs: [],
      sources: ["https://roocodeinc.github.io/Roo-Code/features/custom-instructions"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      files: ["*.md"],
      nestedDiscovery: true,
      importSyntax: null,
      directory: ".roo/rules",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: {
        state: "removed",
        since: "2026-05-15",
        note: "Roo Code was archived on 2026-05-15; the surface is frozen and read-only.",
        supersededByType: null,
      },
      notes:
        "Roo Code exposes auto-approval controls through the extension settings UI, including read, write, command, MCP, browser, and mode-switch approvals. The docs do not describe a stable AXM-writable permission config file for these controls.",
      docs: [],
      sources: ["https://docs.roocode.com/features/auto-approving-actions"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      configFiles: [],
      grammar: null,
      prerequisites: [
        {
          key: "Auto-Approve Settings",
          value: "enabled per operation",
          scope: "user",
          note: "Configure in Roo Code's Auto-Approve Settings panel.",
        },
      ],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented Roo Code permission grant writing.",
    },
  },
} as const satisfies Agent;
