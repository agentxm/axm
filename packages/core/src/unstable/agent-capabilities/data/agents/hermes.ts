import type { Agent } from "../../schema.js";

export const hermesAgent = {
  id: "hermes",
  name: "Hermes Agent",
  vendor: "Nous Research",
  homepage: "https://hermes-agent.nousresearch.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".hermes",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Hermes Agent documentation",
      url: "https://hermes-agent.nousresearch.com/docs",
    },
  ],
  skills: {
    lifecycle: "available",
    notes:
      "Hermes reads SKILL.md skills from ~/.hermes/skills as the source of truth. Additional external skill directories can be configured in ~/.hermes/config.yaml for shared team use.\n",
    docs: [],
    sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".hermes/skills",
  },
  commands: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  mcp: {
    lifecycle: "available",
    notes:
      "Hermes declares MCP servers under mcp_servers in ~/.hermes/config.yaml. The YAML config dialect is outside AXM's current native MCP writer formats.\n",
    docs: [],
    sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp"],
    lastVerified: "2026-05-20",
    scopes: ["user"],
    standardsCompliance: "partial",
    convention: "vendor",
    transports: ["stdio", "http"],
  },
  subagents: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  instructions: {
    lifecycle: "available",
    notes:
      "Hermes reads AGENTS.md as a recursive project instruction source. .hermes.md or HERMES.md are higher-priority native alternatives at the git root, but AGENTS.md is the cross-tool standard AXM writes.\n",
    docs: [],
    sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/configuration"],
    lastVerified: "2026-05-20",
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "universal",
    kind: "agents-md",
    files: ["AGENTS.md"],
    nestedDiscovery: true,
    importSyntax: null,
  },
  rules: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  hooks: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
