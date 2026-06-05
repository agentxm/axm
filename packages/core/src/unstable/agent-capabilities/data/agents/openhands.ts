import type { Agent } from "../../schema.js";

export const openhandsAgent = {
  id: "openhands",
  name: "OpenHands",
  vendor: "All Hands AI",
  homepage: "https://www.all-hands.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".openhands",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "OpenHands documentation",
      url: "https://docs.openhands.dev",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.openhands.dev/overview/skills"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".openhands/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    "mcp-server": {
      lifecycle: "supported",
      notes:
        "OpenHands exposes MCP-like tool integration through its SDK/tool system, but AXM has no verified file-backed MCP writer dialect for this surface yet.\n",
      docs: [],
      sources: [
        "https://docs.openhands.dev/sdk/arch/skill",
        "https://docs.openhands.dev/sdk/arch/tool-system",
      ],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "partial",
      convention: "vendor",
      transports: ["stdio"],
    },
    subagent: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    files: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.openhands.dev/overview/skills"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    hook: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
