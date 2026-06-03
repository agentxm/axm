import type { Agent } from "../../schema.js";

export const forgecodeAgent = {
  id: "forgecode",
  name: "ForgeCode",
  vendor: "Tailcall",
  homepage: "https://forgecode.dev",
  interfaces: ["cli"],
  family: null,
  rootDir: ".forge",
  detection: {
    projectDirs: [".forge"],
    userDirs: ["~/.forge", "~/forge"],
  },
  docs: [
    {
      label: "ForgeCode skills documentation",
      url: "https://forgecode.dev/docs/skills/",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes:
        "ForgeCode also reads shared ~/.agents/skills and documents ~/forge/skills as its global skills path; ~/.forge is retained as an install marker from vercel-labs/skills.\n",
      docs: [],
      sources: [
        "https://forgecode.dev/docs/skills/",
        "https://github.com/vercel-labs/skills/blob/main/src/agents.ts",
      ],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".forge/skills",
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
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://forgecode.dev/docs/agents-md/"],
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
