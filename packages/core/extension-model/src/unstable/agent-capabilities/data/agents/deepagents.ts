import type { Agent } from "../../schema.js";
export const deepagentsAgent = {
  id: "deepagents",
  name: "Deep Agents Code",
  vendor: "LangChain",
  homepage: "https://docs.langchain.com/oss/python/deepagents/overview",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [{ kind: "dir", path: "~/.deepagents", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "Deep Agents skills documentation",
      url: "https://docs.langchain.com/oss/python/deepagents/skills",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skill sources are layered built-in, then plugin, then user ~/.deepagents/<agent>/skills and ~/.agents/skills, then project .deepagents/skills and .agents/skills.\n",
        docs: [],
        sources: [
          "https://docs.langchain.com/oss/python/deepagents/skills",
          "https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/project_utils.py",
          "https://docs.langchain.com/oss/deepagents/code/configuration",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        locations: [
          {
            scope: "user",
            root: "home",
            path: ".deepagents/<agent>/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Resolve the active Deep Agents profile from native configuration before selecting this location.",
            },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".deepagents/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.langchain.com/oss/deepagents/code/configuration"],
          conditions: ["DEEPAGENTS_HOME relocates the entire user profile."],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Detailed definition/frontmatter grammar was not revalidated.",
          ],
          claimScope: "Current Deep Agents Code data directories and user/project precedence",
        },
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
          "The deepagents CLI natively supports MCP servers via 'mcp-servers add|list|tools|update|delete|connect' commands, project-level MCP config discovery/merge, per-server trust/approval, and MCP OAuth session management.\n",
        docs: [],
        sources: [
          "https://reference.langchain.com/python/deepagents-cli",
          "https://pypi.org/project/deepagents-cli/",
          "https://docs.langchain.com/oss/deepagents/code/configuration",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http"],

        locations: [
          {
            scope: "user",
            root: "home",
            path: ".deepagents/.mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition: "Default DEEPAGENTS_HOME only; resolve the active profile directory.",
            },
            provenance: {
              kind: "capability-sources",
            },
            id: "default-user",
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
        ],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.langchain.com/oss/deepagents/code/configuration"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Existing project discovery, transport and entry dialect claims were not fully revalidated.",
          ],
          claimScope: "Global MCP path and relocated profile boundary",
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Deep Agents natively supports MCP servers, but the exact config file path, servers key, and serialization dialect are unverified; no AXM writer is defined to avoid fabricating an install path.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Each subagent is a folder holding an AGENTS.md with YAML frontmatter: .deepagents/agents/<name>/AGENTS.md for the project and ~/.deepagents/<agent>/agents/<name>/AGENTS.md for the user. The name field is optional and defaults to the folder name.",
        docs: [],
        sources: [
          "https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/subagents.py",
          "https://docs.langchain.com/oss/deepagents/code/configuration",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "user",
            root: "home",
            path: ".deepagents/<agent>/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "Resolve the active Deep Agents profile from native configuration before selecting this location.",
            },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".deepagents/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.langchain.com/oss/deepagents/code/configuration"],
          conditions: ["DEEPAGENTS_HOME relocates the entire user profile."],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Detailed definition/frontmatter grammar was not revalidated.",
          ],
          claimScope: "Current Deep Agents Code data directories and user/project precedence",
        },
      },
      axm: {
        status: "unsupported",
        reason:
          "Native nested AGENTS.md profile writing is unverified; AXM can offer a role Skill fallback.",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "Deep Agents Code accepts lifecycle command hooks in the profile hooks.json file.",
        docs: [],
        sources: ["https://docs.langchain.com/oss/deepagents/code/configuration"],

        scopes: ["user"],
        modeling: "native-unmodeled",
        entryDialect: null,
        locations: [
          {
            scope: "user",
            root: "home",
            path: ".deepagents/hooks.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition: "Default DEEPAGENTS_HOME only; resolve the active profile directory.",
            },
            provenance: {
              kind: "capability-sources",
            },
            id: "default-user",
            format: "json",
          },
        ],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://docs.langchain.com/oss/deepagents/code/configuration"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Event serialization and AXM writing remain unmodeled.",
          ],
          claimScope:
            "Deep Agents Code accepts lifecycle command hooks in the profile hooks.json file.",
        },
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "User instructions live under ~/.deepagents/<agent>/AGENTS.md. Project .deepagents/AGENTS.md and root AGENTS.md are both appended when present; DEEPAGENTS_HOME relocates the user profile.",
      docs: [],
      sources: [
        "https://github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/project_utils.py",
        "https://docs.langchain.com/oss/python/deepagents/overview",
        "https://docs.langchain.com/oss/deepagents/code/configuration",
      ],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
        {
          scope: "project",
          root: "project",
          path: ".deepagents/AGENTS.md",
          shape: "file",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
        {
          scope: "user",
          root: "home",
          path: ".deepagents/<agent>/AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "conditional",
            condition: "Resolve the active profile and DEEPAGENTS_HOME before selecting this path.",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
      ],
      nestedDiscovery: false,
      importSyntax: null,

      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://docs.langchain.com/oss/deepagents/code/configuration"],
        conditions: ["The selected agent determines the user AGENTS.md location."],
        limitations: ["No vendor runtime or AXM writer execution was performed."],
        claimScope: "Agent-specific user instructions and project instruction sources",
      },
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Deep Agents Code provides human approval controls for sensitive tool operations.",
      docs: [],
      sources: ["https://docs.langchain.com/oss/deepagents/code/overview"],

      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://docs.langchain.com/oss/deepagents/code/overview"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope:
          "Deep Agents Code provides human approval controls for sensitive tool operations.",
      },
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Deep Agents Code",
      surface: "Deep Agents Code CLI; distinct from the library",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://docs.langchain.com/oss/deepagents/code/overview",
        "https://docs.langchain.com/oss/deepagents/code/configuration",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
      ],
      claimScope: "CLI product identity, separate from the Deep Agents framework",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
