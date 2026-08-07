import type { ExtensionType } from "../../extensions/common.js";

export const RECONCILIATION_SOURCE_CLASSES = [
  "registry",
  "github",
  "gitlab",
  "bitbucket",
  "azurerepos",
  "git",
  "local",
  "workspace",
  "inline",
] as const;

export type ReconciliationSourceClass = (typeof RECONCILIATION_SOURCE_CLASSES)[number];
export type ReconciliationApplicability = "supported" | "unsupported";

export interface ReconciliationObligation {
  readonly canonical: "package" | "pack-manifest" | "package-or-inline-settings-and-native-config";
  readonly projections: ReadonlyArray<string>;
  readonly sources: Readonly<Record<ReconciliationSourceClass, ReconciliationApplicability>>;
}

const allRemoteAndLocal = {
  registry: "supported",
  github: "supported",
  gitlab: "supported",
  bitbucket: "supported",
  azurerepos: "supported",
  git: "supported",
  local: "supported",
  workspace: "supported",
  inline: "unsupported",
} as const satisfies Record<ReconciliationSourceClass, ReconciliationApplicability>;

const registryWorkspaceOnly = {
  registry: "supported",
  github: "unsupported",
  gitlab: "unsupported",
  bitbucket: "unsupported",
  azurerepos: "unsupported",
  git: "unsupported",
  local: "unsupported",
  workspace: "supported",
  inline: "unsupported",
} as const satisfies Record<ReconciliationSourceClass, ReconciliationApplicability>;

export const WORKSPACE_RECONCILIATION_OBLIGATIONS = {
  skill: {
    canonical: "package",
    projections: ["agent skill directories"],
    sources: allRemoteAndLocal,
  },
  "mcp-server": {
    canonical: "package-or-inline-settings-and-native-config",
    projections: ["native MCP configuration", "inline settings/native configuration"],
    sources: {
      ...registryWorkspaceOnly,
      inline: "supported",
    },
  },
  subagent: {
    canonical: "package",
    projections: ["native agent files", "fallback skill projections"],
    sources: allRemoteAndLocal,
  },
  rule: {
    canonical: "package",
    projections: ["instruction regions", "instruction configuration"],
    sources: allRemoteAndLocal,
  },
  hook: {
    canonical: "package",
    projections: ["native hook configuration", "fallback instruction projections"],
    sources: allRemoteAndLocal,
  },
  knowledge: {
    canonical: "package",
    projections: ["knowledge index", "discovery region"],
    sources: allRemoteAndLocal,
  },
  pack: {
    canonical: "pack-manifest",
    projections: ["dependency graph"],
    sources: registryWorkspaceOnly,
  },
} as const satisfies Record<ExtensionType, ReconciliationObligation>;
