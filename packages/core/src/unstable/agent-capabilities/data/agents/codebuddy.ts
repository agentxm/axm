import type { Agent } from "../../schema.js";

export const codebuddyAgent = {
  id: "codebuddy",
  name: "CodeBuddy",
  vendor: "Tencent Cloud",
  homepage: "https://www.codebuddy.ai",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".codebuddy",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "CodeBuddy documentation",
      url: "https://www.codebuddy.ai/docs/ide/Introduction",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://www.codebuddy.ai/docs/ide/Introduction"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".codebuddy/skills",
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
      lifecycle: "supported",
      notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://staging-codebuddy.tencent.com/docs/cli/best-practices"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      directory: ".codebuddy/agents",
      layout: "directory",
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
    lifecycle: "supported",
    notes: null,
    docs: [],
    sources: ["https://staging-codebuddy.tencent.com/docs/cli/reference"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    mechanism: ["cli-flag"],
    configFiles: [],
    grammar: null,
    prerequisites: [],
    cliFlags: [
      {
        flag: "--dangerously-skip-permissions",
        note: "Bypasses CodeBuddy Code permission prompts.",
      },
    ],
    grants: {},
  },
} as const satisfies Agent;
