import type { SetupAgentScan, SetupPlanRow } from "@agentxm/workspace-configuration";
import type { AgentSubagentSummary, SetupScopeSupportCategory } from "@agentxm/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import type { Doc } from "../../screen/index.js";
import { count } from "../../screen/index.js";

const SETUP_PHASES = "Detect · Agents · Instructions · Review";

export const setupBrandingDoc = (branding: string): Doc => [
  { _tag: "blank" },
  { _tag: "paragraph", text: branding },
  { _tag: "blank" },
];

export const setupAgentScanDoc = (scan: SetupAgentScan): Doc => [
  {
    _tag: "headline",
    tone: "info",
    text: `Scanned this repo and your machine - found ${String(scan.detectedCount)} agents.`,
  },
  ...scan.retiredAgents.map((agent) => ({
    _tag: "callout" as const,
    tone: "warn" as const,
    title: `${agent.name} is retired and was not selected automatically.`,
    children: [
      {
        _tag: "paragraph" as const,
        text: `To opt in, run \`axm setup --agent ${agent.id}\`.`,
      },
    ],
  })),
  { _tag: "paragraph", tone: "dim", text: SETUP_PHASES },
];

export const setupPlanDoc = (rows: ReadonlyArray<SetupPlanRow>): Doc => [
  { _tag: "headline", tone: "info", text: "Plan" },
  {
    _tag: "table",
    columns: [{ header: "Target" }, { header: "Action" }, { header: "Detail" }],
    rows: rows.map((row) => [row.target, row.action, row.detail]),
  },
];

export const setupScopeSupportDoc = (
  scope: WorkspaceScope,
  categories: ReadonlyArray<SetupScopeSupportCategory>,
): Doc => [
  { _tag: "headline", tone: "info", text: `Scope support (${scope})` },
  {
    _tag: "table",
    columns: [
      { header: "Extension" },
      { header: "Status" },
      { header: "Target" },
      { header: "Reason" },
    ],
    rows: categories.flatMap((category) =>
      category.outcomes.map((outcome) => [
        category.label,
        outcome.status,
        outcome.agentName ?? outcome.target ?? category.placement,
        outcome.reason,
      ]),
    ),
  },
];

export const subagentSummaryDoc = (
  summaries: ReadonlyArray<AgentSubagentSummary>,
  displayDirectory: (directory: string) => string,
): Doc =>
  summaries.flatMap((summary) =>
    summary.files.length === 0
      ? []
      : [
          {
            _tag: "paragraph" as const,
            text: `${summary.agentName}: ${count(summary.files.length, "existing subagent file")} in ${displayDirectory(summary.subagentDir)}`,
          },
        ],
  );
