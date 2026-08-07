import type { Agent } from "../../schema.js";
export const minimaxCodeAgent = {
  id: "minimax-code",
  name: "MiniMax Code",
  vendor: "MiniMax",
  homepage: "https://agent.minimax.io/download",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [{ label: "MiniMax Code", url: "https://github.com/MiniMax-AI/minimax-code" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "MiniMax advertises generated skills, but its vendor materials do not publish a stable SKILL.md directory or install contract AXM can target.",
        docs: [],
        sources: [
          "https://agent.minimax.io/download",
          "https://github.com/MiniMax-AI/minimax-code",
        ],
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-08-05",
        writer: null,
        reason: "No vendor-documented filesystem Skill location is available.",
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "MiniMax publishes MCP servers and a hosted Agent product, but does not document a MiniMax Code client configuration file.",
        docs: [],
        sources: ["https://github.com/MiniMax-AI/MiniMax-MCP"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No vendor-documented MiniMax Code MCP client target is available.",
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "The product describes Agent teams, but vendor materials do not define a portable custom-subagent file format.",
        docs: [],
        sources: ["https://agent.minimax.io/download"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No vendor-documented custom-subagent filesystem surface is available.",
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
