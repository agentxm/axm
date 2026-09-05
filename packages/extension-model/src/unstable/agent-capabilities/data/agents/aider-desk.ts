import type { Agent } from "../../schema.js";
export const aiderDeskAgent = {
  id: "aider-desk",
  name: "AiderDesk",
  vendor: "HOTOVO",
  homepage: "https://github.com/hotovo/aider-desk",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".aider-desk",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".aider-desk", signal: "definitive", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.aider-desk", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "AiderDesk repository",
      url: "https://github.com/hotovo/aider-desk",
    },
    {
      label: "AiderDesk documentation",
      url: "https://aiderdesk.hotovo.com/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://aiderdesk.hotovo.com/docs/features/skills",
          "https://github.com/hotovo/aider-desk/issues/568",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".aider-desk/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "AiderDesk is a native MCP client: it connects to external standard MCP servers and exposes their tools to the agent, registering only the servers listed in a profile's enabledServers. MCP client configuration lives under the .aider-desk config, but the exact config file path, servers key, and per-transport dialect are not documented, so no AXM writer is modeled. AiderDesk can additionally act as an MCP server via @aiderdesk/mcp-server (the inverse direction).",
        docs: [],
        sources: ["https://github.com/hotovo/aider-desk"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AiderDesk's MCP client config dialect (exact file path, servers key, and transport-specific shape under .aider-desk) is not documented, so AXM has no MCP writer.",
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
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "AiderDesk has a native lifecycle hook / Extension System with 30+ events (onTaskCreated, onPromptFinished, onToolCalled, onFileAdded, ...) that can observe, modify, or block operations. Hooks are in-process JS/TS callbacks under .aider-desk/hooks/ (project) and ~/.aider-desk/hooks/ (user), with a newer Extension System under .aider-desk/extensions/. The native event names are not canonically mappable and there is no command-stdin dialect for AXM to serialize.",
        docs: [],
        sources: ["https://github.com/hotovo/aider-desk"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason:
          "AiderDesk hooks are in-process JS/TS callbacks with no command-stdin serialization dialect, and its 30+ native events are not canonically mapped, so AXM has no hook writer.",
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
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "AiderDesk gates tool execution with a three-state per-tool approval (Always / Ask / Never) configured per agent profile, plus pattern-based allow/deny regex for bash commands. Approvals are persisted in the per-profile JSON, but the exact config file location and grammar are not documented, so AXM has no grant writer.",
      docs: [],
      sources: ["https://github.com/hotovo/aider-desk"],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason:
        "AiderDesk tool-approval settings live in per-profile JSON without a documented, stable writable path or grammar, so AXM cannot safely write permission grants.",
    },
  },
} as const satisfies Agent;
