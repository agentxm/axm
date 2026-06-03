import type { Agent } from "../../schema.js";

export const cortexAgent = {
  id: "cortex",
  name: "Cortex Code",
  vendor: "Snowflake",
  homepage: "https://www.snowflake.com/en/product/features/cortex-code",
  interfaces: ["cli"],
  family: null,
  rootDir: ".cortex",
  detection: {
    projectDirs: [".cortex"],
    userDirs: ["~/.snowflake/cortex"],
  },
  docs: [
    {
      label: "Cortex Code CLI extensibility",
      url: "https://docs.snowflake.com/en/user-guide/cortex-code/extensibility",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: [
        "https://docs.snowflake.com/en/user-guide/cortex-code/extensibility",
        "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
      ],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".cortex/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    "mcp-server": {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
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
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
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
