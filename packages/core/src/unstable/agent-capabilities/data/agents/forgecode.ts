import type { Agent } from "../../schema.js";
export const forgecodeAgent = {
  id: "forgecode",
  name: "ForgeCode",
  vendor: "Tailcall",
  homepage: "https://forgecode.dev",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".forge",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".forge", signal: "definitive", note: null }] },
    user: {
      markers: [
        { kind: "dir", path: "~/.forge", signal: "definitive", note: null },
        { kind: "dir", path: "~/forge", signal: "definitive", note: null },
      ],
    },
  },
  docs: [
    {
      label: "ForgeCode skills documentation",
      url: "https://forgecode.dev/docs/skills/",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "ForgeCode also reads shared ~/.agents/skills and documents ~/forge/skills as its global skills path.",
        docs: [],
        sources: ["https://forgecode.dev/docs/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".forge/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "ForgeCode custom commands are Markdown files under .forge/commands.",
        docs: [],
        sources: ["https://forgecode.dev/docs/commands/"],
        scopes: ["user", "project"],
        directory: ".forge/commands",
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "ForgeCode supports local and remote MCP servers.",
        docs: [],
        sources: ["https://forgecode.dev/docs/mcp-integration/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "ForgeCode custom agents are files under .forge/agents.",
        docs: [],
        sources: ["https://forgecode.dev/docs/creating-agents/"],
        scopes: ["user", "project"],
        directory: ".forge/agents",
        layout: "directory",
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
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
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://forgecode.dev/docs/custom-rules/"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "ForgeCode permissions.yaml policies combine read, write, command, and URL glob rules with all, any, and not operators; decisions are allow, deny, or confirm.",
      docs: [],
      sources: ["https://forgecode.dev/docs/permissions/"],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.forge/permissions.yaml",
          format: "yaml",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".forge.toml",
          format: "toml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "glob",
        example: 'command: "git *"',
        notes:
          "Rules support all, any, and not composition with allow, deny, and confirm decisions.",
      },
      prerequisites: [
        {
          key: "restricted",
          value: "true",
          scope: "project",
          note: "Enables restricted permission policy enforcement from .forge.toml.",
        },
      ],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
