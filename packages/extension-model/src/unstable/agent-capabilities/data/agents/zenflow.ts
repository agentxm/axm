import type { Agent } from "../../schema.js";
export const zenflowAgent = {
  id: "zenflow",
  name: "Zenflow",
  vendor: "Zencoder",
  homepage: "https://zencoder.ai/zenflow",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".zenflow",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".zenflow", signal: "definitive", note: null }] },
    user: { markers: [] },
  },
  docs: [{ label: "Zenflow documentation", url: "https://docs.zencoder.ai/zenflow/task-types" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Because Zenflow's project Skill directory is .agents/skills, --agent universal already wrote to the correct location; this entry adds Zenflow-specific detection and naming.",
        docs: [],
        sources: ["https://docs.zencoder.ai/features/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
        additionalReadPaths: [
          { path: ".claude/skills", status: "compat" },
          { path: ".zencoder/skills", status: "deprecated" },
        ],
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Zenflow exposes hosted MCP integrations and a built-in MCP server, but vendor docs do not publish a repository MCP client file AXM can write.",
        docs: [],
        sources: ["https://docs.zencoder.ai/zenflow/integrations"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "Zenflow MCP integrations are managed through the product UI.",
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Zenflow can orchestrate subagents, but presets and workflow comments are not a portable custom-subagent directory.",
        docs: [],
        sources: ["https://docs.zencoder.ai/zenflow/multi-agent-orchestration"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No vendor-documented custom-subagent filesystem target is available.",
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
      axm: { status: "unsupported", writer: null, lastVerified: null },
    },
  },
  instructions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes:
        "Zenflow runs supported underlying agents in worktrees; instruction-file behavior belongs to the selected agent rather than a Zenflow-specific rule format.",
      docs: [],
      sources: ["https://docs.zencoder.ai/clis/overview"],
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes:
        "Execution mode, approval policy, and tool permissions are configured on Zenflow agent presets rather than a documented repository file.",
      docs: [],
      sources: ["https://docs.zencoder.ai/zenflow/multi-agent-orchestration"],
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
} as const satisfies Agent;
