import type { Agent } from "../../schema.js";

export const antigravityAgent = {
  id: "antigravity",
  name: "Antigravity",
  vendor: "Google",
  homepage: "https://antigravity.google",
  interfaces: ["cli", "ide-extension"],
  family: "google",
  rootDir: null,
  detection: {
    projectDirs: [".agents", ".agent"],
    userDirs: ["~/.gemini/antigravity"],
  },
  docs: [
    {
      label: "Antigravity documentation",
      url: "https://antigravity.google/docs",
    },
    {
      label: "Antigravity CLI overview",
      url: "https://antigravity.google/docs/cli-overview",
    },
  ],
  skills: {
    lifecycle: "available",
    notes:
      "Antigravity 2.0 defaults to .agents/skills (project) and ~/.gemini/antigravity/skills (user); .agent/skills remains supported for backward compatibility.\n",
    docs: [],
    sources: ["https://antigravity.google/docs/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    directory: ".agents/skills",
  },
  commands: {
    lifecycle: "available",
    notes:
      'Custom slash commands ("workflows") are Markdown files under .agents/workflows (project) or ~/.gemini/antigravity/global_workflows (user). Commands have no industry spec yet.\n',
    docs: [],
    sources: ["https://antigravity.google/docs/rules-workflows"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".agents/workflows",
  },
  mcp: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://antigravity.google/docs/mcp"],
    lastVerified: "2026-05-20",
    scopes: ["user"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio"],
    config: {
      serversKey: "mcpServers",
      nativeEnabled: false,
      targets: [
        {
          scope: "user",
          path: "~/.gemini/antigravity/mcp_config.json",
          format: "json",
        },
      ],
      stdio: {
        typeField: null,
        command: "split",
        envKey: "env",
      },
      remote: null,
      transform: null,
    },
  },
  subagents: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  instructions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: [
      "https://antigravity.google/docs/project-context",
      "https://antigravity.google/docs/rules-workflows",
    ],
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
    lifecycle: "available",
    notes:
      "Antigravity 2.0 reads workspace rules from .agents/rules (project). Global rules live at ~/.gemini/GEMINI.md and may collide with Gemini CLI's global context file.\n",
    docs: [],
    sources: ["https://antigravity.google/docs/rules-workflows"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".agents/rules",
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
