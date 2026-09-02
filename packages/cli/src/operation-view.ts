import * as Option from "effect/Option";
import * as Effect from "effect/Effect";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  countUnitStates,
  defaultOperationPresentation,
  deriveOperationOutcome,
  presentationOf,
  type JobStepArtifact,
  type OperationResolution,
  type Plan,
  type PlannedJobStep,
  type ResolvedUnit,
} from "@agentxm/workspace-operations";

import { Verbosity, type VerbosityLevel } from "./cli-flags/index.js";
import type { Doc, RowNode, Tone } from "./screen/doc.js";
import { Screen } from "./screen/screen.js";
import {
  agentOutcome,
  artifactChange,
  blockingClass,
  count,
  disposition,
  interruptionPhrase,
  outcomeHeadline,
  unitState,
  unitStateChange,
} from "./screen/phrases.js";

const artifactPaths = (artifact: JobStepArtifact): string =>
  artifact.targets === undefined || artifact.targets.length === 0
    ? artifact.path
    : artifact.targets.map((target) => target.path).join(", ");

const artifactCells = (artifact: JobStepArtifact | undefined): ReadonlyArray<string> => {
  if (artifact === undefined) return [];
  return [
    artifact.version,
    artifactChange(artifact.change),
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    artifactPaths(artifact),
  ].filter((value): value is string => value !== undefined && value.length > 0);
};

const outcomeChildren = (unit: ResolvedUnit<unknown>): Doc => {
  const outcomes = unit.agentOutcomes ?? unit.artifact?.agentOutcomes ?? [];
  return outcomes.map((outcome) => ({
    _tag: "paragraph",
    tone: outcome.outcome === "failed" || outcome.outcome === "blocked" ? "warn" : "dim",
    text: `${outcome.agentId}: ${agentOutcome(outcome.outcome)}${outcome.path === undefined ? "" : ` at ${outcome.path}`} — ${outcome.reason}`,
  }));
};

const resolutionRow = (unit: ResolvedUnit<unknown>): RowNode => ({
  _tag: "row",
  change: unitStateChange(unit.state),
  cells: [
    unit.label,
    ...artifactCells(unit.artifact),
    ...(unit.artifact === undefined ? [unitState(unit.state)] : []),
    ...(unit.artifact !== undefined ||
    unit.message === undefined ||
    unit.message.trim().length === 0
      ? []
      : [unit.message]),
    ...(unit.disposition === undefined ? [] : [disposition(unit.disposition)]),
  ],
  ...(outcomeChildren(unit).length === 0 ? {} : { children: outcomeChildren(unit) }),
});

const headlineTone = (outcome: ReturnType<typeof deriveOperationOutcome>): Tone => {
  switch (outcome) {
    case "previewed":
      return "info";
    case "applied":
    case "no-op":
      return "ok";
    case "partial":
    case "blocked":
    case "cancelled":
      return "warn";
    case "failed":
    case "interrupted":
      return "error";
  }
};

const groupedWarnings = (units: ReadonlyArray<ResolvedUnit<unknown>>): Doc => {
  const groups = new Map<string, Array<string>>();
  for (const unit of units) {
    for (const warning of unit.warnings ?? []) {
      const labels = groups.get(warning) ?? [];
      labels.push(unit.label);
      groups.set(warning, labels);
    }
  }
  if (groups.size === 0) return [];
  return [
    {
      _tag: "section",
      title: count(groups.size, "warning"),
      children: [...groups].map(([warning, labels]) => ({
        _tag: "callout",
        tone: "warn",
        title: warning,
        children: [{ _tag: "paragraph", tone: "dim", text: labels.join(", ") }],
      })),
    },
  ];
};

const agentCoverage = (units: ReadonlyArray<ResolvedUnit<unknown>>): ReadonlyArray<string> => [
  ...new Set(
    units.flatMap((unit) =>
      unit.state === "committed" || unit.state === "unchanged"
        ? (unit.artifact?.agents ?? []).filter((agent) => agent !== "universal")
        : [],
    ),
  ),
];

export interface AgentCoverageSummary {
  readonly agents: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}

export const resolutionAgentCoverage = (
  resolution: OperationResolution<unknown>,
): AgentCoverageSummary | undefined => {
  const agents = agentCoverage(resolution.units);
  const scope = resolution.units.find(
    (unit) =>
      (unit.state === "committed" || unit.state === "unchanged") &&
      unit.artifact?.agents !== undefined,
  )?.artifact?.scope;
  return scope === undefined ? undefined : { agents, scope };
};

export interface OperationDocOptions {
  readonly verbosity: VerbosityLevel;
  readonly message?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

export const operationDoc = (
  resolution: OperationResolution<unknown>,
  options: OperationDocOptions,
): Doc => {
  const outcome = deriveOperationOutcome(resolution);
  if (outcome === "previewed" && resolution.divergence !== true) return [];
  const counts = countUnitStates(resolution.units);
  const presentation = resolution.presentation ?? defaultOperationPresentation;
  const headline =
    options.message ??
    (outcome === "blocked" && resolution.blocking !== undefined
      ? `${outcomeHeadline(presentation, outcome, counts)} — ${blockingClass(resolution.blocking.class)}`
      : outcome === "failed" && counts.rolledBack > 0
        ? `${outcomeHeadline(presentation, outcome, counts)} — all changes rolled back`
        : outcome === "interrupted" && resolution.interruption !== undefined
          ? interruptionPhrase(resolution.interruption.signal, resolution.interruption.disposition)
          : outcomeHeadline(presentation, outcome, counts));
  const detailed = options.verbosity === "verbose" || options.verbosity === "debug";
  const visible = resolution.units.filter(
    (unit) => detailed || (unit.state !== "unchanged" && unit.state !== "skipped"),
  );
  const coverage = resolutionAgentCoverage(resolution);
  const next = [...(options.suggestions ?? []), ...(resolution.recovery?.actions ?? [])];

  return [
    { _tag: "headline", tone: headlineTone(outcome), text: headline },
    ...(resolution.failure?.detail === undefined
      ? []
      : [{ _tag: "paragraph", tone: "error", text: resolution.failure.detail } as const]),
    ...(resolution.blocking?.detail === undefined
      ? []
      : [{ _tag: "paragraph", text: resolution.blocking.detail } as const]),
    ...(visible.length === 0 ? [] : [{ _tag: "rows", rows: visible.map(resolutionRow) } as const]),
    ...(!detailed && counts.unchanged > 0
      ? [
          {
            _tag: "collapsed",
            change: "unchanged",
            count: counts.unchanged,
            noun: `${counts.unchanged === 1 ? presentation.subject.singular : presentation.subject.plural} already current`,
            hint: "--verbose to list",
          } as const,
        ]
      : []),
    ...(!detailed && counts.skipped > 0
      ? [
          {
            _tag: "collapsed",
            change: "unchanged",
            count: counts.skipped,
            noun: `${counts.skipped === 1 ? presentation.subject.singular : presentation.subject.plural} not selected`,
            hint: "--verbose to list",
          } as const,
        ]
      : []),
    ...groupedWarnings(resolution.units),
    ...(coverage === undefined
      ? []
      : [
          {
            _tag: "paragraph",
            tone: "dim",
            text: `Agents: ${coverage.agents.length === 0 ? "none" : coverage.agents.join(", ")}`,
          } as const,
        ]),
    ...(coverage === undefined || coverage.agents.length > 0
      ? []
      : [
          {
            _tag: "callout",
            tone: "warn",
            title: "No coding-agent targets were materialized",
            children: [
              {
                _tag: "paragraph",
                text: `Run \`axm agents add --detected${coverage.scope === "user" ? " --scope user" : ""}\`, then retry.`,
              },
            ],
          } as const,
        ]),
    ...(next.length === 0 ? [] : [{ _tag: "next", actions: next } as const]),
  ];
};

const plannedRow = (step: PlannedJobStep<unknown, unknown>): RowNode => {
  const outcomes = step.agentOutcomes ?? step.artifact?.agentOutcomes ?? [];
  const children: Doc = outcomes.map((outcome) => ({
    _tag: "paragraph",
    tone: outcome.outcome === "failed" || outcome.outcome === "blocked" ? "warn" : "dim",
    text: `${outcome.agentId}: ${agentOutcome(outcome.outcome)} — ${outcome.reason}`,
  }));
  return {
    _tag: "row",
    change: step.readiness === "error" ? "blocked" : "create",
    cells: [
      step.label,
      ...artifactCells(step.artifact),
      ...(step.readiness === "warn" ? [step.warnMessage] : []),
      ...(step.readiness === "error" ? [step.errorMessage] : []),
    ],
    ...(children.length === 0 ? {} : { children }),
  };
};

export const planDoc = (
  plan: Plan<unknown, unknown>,
  options: { readonly mode: "preview" | "apply"; readonly verbosity: VerbosityLevel },
): Doc => {
  const steps = plan.jobs.flatMap((job) => [...job.steps]);
  if (steps.length === 0) return [];
  const presentation = presentationOf(plan);
  const risks = plan.riskConditions ?? [];
  if (options.mode === "apply" && !risks.some((risk) => risk.level === "confirmable")) return [];
  const headline = `${options.mode === "preview" ? "Would" : "Ready to"} ${presentation.verb.imperative} ${count(steps.length, presentation.subject.singular, presentation.subject.plural)}`;
  const ready = steps.filter((step) => step.readiness === "ready").length;
  const warnings = steps.filter((step) => step.readiness === "warn").length + risks.length;
  const errors = steps.filter((step) => step.readiness === "error").length;
  const parts = [
    ready > 0 ? `${ready} to ${presentation.verb.imperative}` : undefined,
    warnings > 0 ? count(warnings, "warning") : undefined,
    errors > 0 ? count(errors, "error") : undefined,
  ].filter((value): value is string => value !== undefined);

  return [
    {
      _tag: "headline",
      tone: errors > 0 ? "error" : warnings > 0 ? "warn" : "info",
      text: headline,
    },
    ...Option.match(plan.description, {
      onNone: (): Doc => [],
      onSome: (description): Doc => [{ _tag: "paragraph", text: description }],
    }),
    ...(options.verbosity === "quiet"
      ? []
      : [{ _tag: "rows", rows: steps.map(plannedRow) } as const]),
    ...risks.map((risk) => ({ _tag: "callout", tone: "warn", title: risk.detail }) as const),
    ...(options.mode !== "preview" || parts.length === 0
      ? []
      : [{ _tag: "summary", parts: parts.map((text) => ({ text })) } as const]),
  ];
};

/** Paint the planning-time orientation through the application-owned screen. */
export const presentPlan = (
  plan: Plan<unknown, unknown>,
  options?: { readonly mode?: "preview" | "apply" },
) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const doc = planDoc(plan, {
      mode: options?.mode ?? "preview",
      verbosity: verbosity.level,
    });
    if (doc.length > 0) yield* screen.note(doc);
  });
