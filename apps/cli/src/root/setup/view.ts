import type {
  SetupAgentScan,
  SetupArtifactTarget,
  SetupOutcome,
  SetupPlanDetail,
  SetupPlanRow,
} from "@agentxm/workspace/configuration";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type { Doc, LedgerColumn, LedgerRow, Mark } from "../../screen/index.js";
import {
  artifactChange,
  artifactChangeMark,
  count,
  emphatic,
  factParts,
  joined,
  ledgerViewPolicy,
  suggestionsDoc,
} from "../../screen/index.js";

/**
 * The title line setup opens with, like every command whose result carries a
 * ledger: what it is doing and where, stated once so no row repeats it.
 */
export const setupTitleDoc = (args: {
  readonly preview: boolean;
  readonly where: string;
  readonly scope: WorkspaceScope;
}): Doc => [
  {
    _tag: "headline",
    tone: "neutral",
    text: emphatic(`${args.preview ? "Previewing setup" : "Setting up AXM"} in ${args.where}`),
    aside: factParts([`${args.scope} scope`]),
  },
];

/**
 * What the scan found, as the first line of the record: it reads like the
 * answers that follow it, with how much it found at the value column.
 */
export const setupAgentScanDoc = (scan: SetupAgentScan): Doc => [
  {
    _tag: "headline",
    tone: "ok",
    text: "Scanned repo and machine",
    aside: factParts([`found ${count(scan.detectedCount, "agent")}`]),
  },
  ...scan.retiredAgents.map(
    (agent) =>
      ({
        _tag: "callout",
        tone: "warn",
        title: `${agent.name} is retired and was not selected automatically.`,
        children: [
          { _tag: "paragraph", text: `To opt in, run \`axm setup --agent ${agent.id}\`.` },
        ],
      }) as const,
  ),
];

const planColumns: ReadonlyArray<LedgerColumn> = [
  { header: "Target", role: "name" },
  { header: "Plan", role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

/** The mark and the word a plan row carries for what setup would do to its target. */
const planAction = (
  action: SetupPlanRow["action"],
): { readonly mark: Mark; readonly word: string } => {
  switch (action) {
    case "create":
      return { mark: "create", word: "create" };
    case "update":
      return { mark: "update", word: "update" };
    case "in sync":
      return { mark: "unchanged", word: "keep" };
    case "link":
      return { mark: "create", word: "link" };
    case "copy":
      return { mark: "create", word: "copy" };
    case "skip":
      return { mark: "unchanged", word: "skip" };
  }
};

const planDetail = (detail: SetupPlanDetail): string => {
  switch (detail._tag) {
    case "settings":
      return `agents: ${detail.agentIds.join(", ")}`;
    case "gitignore":
      return "AXM runtime and package transaction artifacts";
    case "instructionSource":
      return detail.seededFrom === undefined ? "source" : `seeded from ${detail.seededFrom}`;
    case "instructionTarget":
      return detail.agentName;
    case "missingInstructionConvention":
      return "no instruction convention";
    case "acceptedResolution":
      return "accepted resolution";
  }
};

/** The plan ledger the apply gate asks about: one row per target setup would touch. */
export const setupPlanDoc = (rows: ReadonlyArray<SetupPlanRow>): Doc => [
  {
    _tag: "ledger",
    columns: planColumns,
    rows: rows.map((row) => {
      const action = planAction(row.action);
      return { mark: action.mark, cells: [row.target, action.word, planDetail(row.detail)] };
    }),
  },
];

const resultColumns: ReadonlyArray<LedgerColumn> = [
  { header: "Target", role: "name" },
  { header: "Status", role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

/**
 * One row per file the workspace now occupies; a file an agent reads names
 * that agent. A versioned package, such as the bundled skill, is named by its
 * identity and version rather than its long path, so the name column stays
 * within the record's key lane.
 */
const resultRows = (result: SetupOutcome): ReadonlyArray<LedgerRow> => {
  const agentName = (id: string): string =>
    result.agents.find((agent) => agent.id === id)?.name ?? id;
  return result.steps.flatMap((step) =>
    (step.artifact?.targets ?? []).map((target: SetupArtifactTarget, index): LedgerRow => {
      const version = index === 0 ? step.artifact?.version : undefined;
      return {
        mark: artifactChangeMark(target.change),
        cells: [
          version === undefined ? target.path : step.label,
          artifactChange(target.change),
          version === undefined ? (target.agentIds ?? []).map(agentName).join(", ") : version,
        ],
      };
    }),
  );
};

/** How many files the apply created and changed, as the verdict's aside counts them. */
const changeTally = (rows: ReadonlyArray<LedgerRow>): string =>
  joined(
    (["create", "update"] as const).map((mark) => {
      const value = rows.filter((row) => row.mark === mark).length;
      return value === 0
        ? undefined
        : `${String(value)} ${mark === "create" ? "created" : "updated"}`;
    }),
  );

/**
 * The extension types the configured agents cannot take in this scope. What
 * every agent supports needs no mention, so only the limits are listed, one
 * aside to a line.
 */
const scopeLimitsDoc = (result: SetupOutcome): Doc => {
  const limits = result.scopeSupport.flatMap((category) =>
    category.outcomes
      .filter((outcome) => outcome.status !== "supported")
      .map((outcome) => `${category.label}: ${outcome.reason}`),
  );
  return limits.length === 0
    ? []
    : [
        {
          _tag: "callout",
          tone: "info",
          title: `Some extension types are limited in ${result.scope} scope`,
          children: limits.map(
            (limit) => ({ _tag: "paragraph", tone: "dim", text: limit }) as const,
          ),
        },
      ];
};

/** Subagent files already present for a configured agent, which setup leaves alone. */
const existingSubagentsDoc = (
  result: SetupOutcome,
  displayDirectory: (directory: string) => string,
): Doc => {
  const found = (result.subagentFiles ?? []).filter((summary) => summary.files.length > 0);
  return found.length === 0
    ? []
    : [
        {
          _tag: "callout",
          tone: "info",
          title: "Existing subagent files were left as they are",
          children: found.map(
            (summary) =>
              ({
                _tag: "paragraph",
                tone: "dim",
                text: `${summary.agentName}: ${count(summary.files.length, "file")} in ${displayDirectory(summary.subagentDir)}`,
              }) as const,
          ),
        },
      ];
};

/** Warnings the report carries, such as a workspace set up with no coding agents. */
const warningsDoc = (result: SetupOutcome): Doc =>
  result.steps.flatMap((step) =>
    step.status === "warning" && step.message !== undefined
      ? [{ _tag: "callout", tone: "warn", title: step.message } as const]
      : [],
  );

const agentsPhrase = (agents: number): string =>
  agents === 0 ? "with no coding agents" : `for ${count(agents, "agent")}`;

/** Which default a preview took for its agents, when it was not told them. */
const previewDefaultPhrase = (result: SetupOutcome): string | undefined => {
  switch (result.previewDefaults?.agents) {
    case "detected":
      return "detected agents";
    case "suggested":
      return "suggested agents";
    case "explicit":
    case undefined:
      return undefined;
  }
};

export interface SetupResultOptions {
  readonly verbosity: VerbosityLevel;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly displayDirectory: (directory: string) => string;
}

/**
 * The settled setup record. A first-time setup settles into the ledger of
 * files it wrote and a verdict; a preview has already shown its plan, so it
 * ends with what it would do and the command that does it; a workspace that
 * was already set up, or a setup the person declined, changed nothing, so its
 * verdict stands alone. Quiet keeps the verdict and nothing else.
 */
export const setupResultDoc = (result: SetupOutcome, options: SetupResultOptions): Doc => {
  const { quiet } = ledgerViewPolicy(options.verbosity);
  const next = quiet ? [] : suggestionsDoc(options.suggestions);
  switch (result.status) {
    case "cancelled":
      return [
        {
          _tag: "headline",
          tone: "warn",
          text: "Setup cancelled",
          aside: factParts(["nothing was changed"]),
        },
      ];
    case "approval-required":
      return [{ _tag: "headline", tone: "warn", text: result.message ?? "" }, ...next];
    case "already-initialized":
      return [{ _tag: "headline", tone: "ok", text: result.message ?? "" }, ...next];
    case "preview":
      return [
        {
          _tag: "headline",
          tone: "neutral",
          text: emphatic(`Would set up AXM ${agentsPhrase(result.agents.length)}`),
          aside: factParts([previewDefaultPhrase(result), "nothing was written"]),
        },
        ...next,
      ];
    case "initialized": {
      const rows = resultRows(result);
      return [
        ...(quiet || rows.length === 0
          ? []
          : [{ _tag: "ledger", columns: resultColumns, rows } as const]),
        ...warningsDoc(result),
        {
          _tag: "headline",
          tone: "ok",
          verdict: true,
          text: emphatic(`Set up AXM ${agentsPhrase(result.agents.length)}`),
          aside: factParts([changeTally(rows)]),
        },
        ...(quiet ? [] : scopeLimitsDoc(result)),
        ...(quiet ? [] : existingSubagentsDoc(result, options.displayDirectory)),
        ...next,
      ];
    }
  }
};
