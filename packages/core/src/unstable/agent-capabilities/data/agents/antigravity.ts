import type { Agent } from "../../schema.js";
export const antigravityAgent = {
  id: "antigravity",
  name: "Antigravity",
  vendor: "Google",
  homepage: "https://antigravity.google",
  interfaces: ["cli", "ide-extension"],
  family: "google",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [
        { kind: "dir", path: ".agents", signal: "definitive", note: null },
        { kind: "dir", path: ".agent", signal: "definitive", note: null },
      ],
    },
    user: {
      markers: [{ kind: "dir", path: "~/.gemini/antigravity", signal: "definitive", note: null }],
    },
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
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Antigravity 2.0 defaults to .agents/skills (project) and ~/.gemini/antigravity/skills (user); .agent/skills remains supported for backward compatibility.\n",
        docs: [],
        sources: ["https://antigravity.google/docs/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          'Custom slash commands ("workflows") are Markdown files under .agents/workflows (project) or ~/.gemini/antigravity/global_workflows (user). Commands have no industry spec yet.\n',
        docs: [],
        sources: ["https://antigravity.google/docs/rules-workflows"],
        scopes: ["user", "project"],
        directory: ".agents/workflows",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://antigravity.google/docs/mcp"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: {
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
        support: "unsupported",
        writer: null,
      },
    },
    files: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    rule: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://antigravity.google/docs/project-context",
          "https://antigravity.google/docs/rules-workflows",
        ],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".agents/rules",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Antigravity documents command hooks in hooks.json for the current Antigravity execution loop. This supersedes earlier research that found hooks only in SDK/plugin surfaces.",
        docs: [],
        sources: [
          "https://antigravity.google/docs/hooks",
          "https://antigravity.google/docs/cli-plugins",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        writer: null,
        verified: null,
        reason: "AXM has not implemented an Antigravity hooks writer.",
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: {
      support: "unsupported",
      writer: null,
    },
  },
} as const satisfies Agent;
