/** Semantic narration shared by terminals and pipes; measurements stay transient. */
import { plain, type Doc, type Tone } from "./doc.js";
import { factParts } from "./docs.js";
import {
  duration,
  phaseLabel,
  progressMeasure,
  retryAttempt,
  settledOutcomeTone,
  systemWaitStatus,
  unitState,
} from "./phrases.js";
import { operationElapsedMs, type ProgressState, type ProgressUnitState } from "./progress.js";
import type { ScenePart } from "./scene.js";
import { PROSE_SEPARATOR } from "./presenter-helpers.js";

export interface NarrationOptions {
  readonly detailed?: boolean;
  readonly quiet?: boolean;
  readonly static?: boolean;
  readonly attributeOperation?: boolean;
}

const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const incomplete = (unit: ProgressUnitState): boolean =>
  unit.failure !== undefined ||
  unit.status === "failed" ||
  unit.status === "rolled-back" ||
  unit.status === "blocked" ||
  unit.status === "cancelled" ||
  unit.status === "interrupted";

const phaseConclusion = (state: ProgressState, next: ProgressState): Doc => {
  if (state.phase === undefined) return [];
  const units = state.units.filter((unit) => unit.phase === state.phase);
  const problems = units.filter(incomplete).length;
  const running = units.some((unit) => unit.status === "running");
  const stopped = next.settled?.outcome === "interrupted" || next.settled?.outcome === "cancelled";
  const unsuccessful =
    next.settled !== undefined && settledOutcomeTone(next.settled.outcome) !== "ok";
  const activity = phaseLabel(state.phase);
  return [
    {
      _tag: "headline",
      tone: problems > 0 || unsuccessful ? "warn" : running ? "info" : "ok",
      text: stopped
        ? `${sentence(activity)} stopped`
        : running
          ? `Leaving ${activity}; work continues`
          : `Finished ${activity}`,
      ...(problems === 0
        ? {}
        : { aside: factParts([`${String(problems)} did not complete as planned`]) }),
    },
  ];
};

/** Continuous activity details are not promised permanent per-unit results. */
export const progressActivity =
  (state: ProgressState): ScenePart =>
  (facts) => {
    if (state.settled !== undefined || state.operation === undefined) return [];
    const running = state.units.filter((unit) => unit.status === "running");
    const unit = running.at(-1);
    const wait = state.waiting.at(-1);
    const phaseUnits = state.units.filter(
      (item) => item.phase === state.phase && item.parentId === undefined,
    );
    const total = phaseUnits[0]?.total;
    const finished = phaseUnits.filter((item) => item.status !== "running").length;
    const failed = phaseUnits.filter(incomplete).length;
    const count =
      total !== undefined &&
      phaseUnits.every((item) => item.total === total) &&
      phaseUnits.length <= total
        ? `${String(finished)} of ${String(total)} work items finished${failed === 0 ? "" : `, ${String(failed)} did not complete as planned`}`
        : undefined;
    const activity = state.phase === undefined ? "Working" : sentence(phaseLabel(state.phase));
    const retry = unit?.attempt === undefined ? undefined : retryAttempt(unit.attempt);
    const details = [
      wait === undefined
        ? undefined
        : `${systemWaitStatus(wait.blockingClass)}${wait.detail.length === 0 ? "" : `: ${wait.detail}`}`,
      unit?.label,
      count,
      running.length > 1 ? `${String(running.length)} work items active` : undefined,
      unit?.measure === undefined || retry !== undefined
        ? undefined
        : progressMeasure(unit.measure),
      retry,
    ].filter((value) => value !== undefined);
    const elapsed = operationElapsedMs(state, facts.nowMs);
    return [
      {
        _tag: "wait",
        status: `${activity}: ${state.operation.name}`,
        ...(elapsed === undefined ? {} : { clock: duration(elapsed) }),
        ...(details.length === 0 ? {} : { detail: details.join(PROSE_SEPARATOR) }),
        chips: [],
      },
    ];
  };

export const progressTransitionDoc = (
  previous: ProgressState | undefined,
  next: ProgressState,
  options: NarrationOptions = {},
): Doc => {
  const doc: Array<Doc[number]> = [];
  const settledNow = next.settled !== undefined && previous?.settled === undefined;
  if (!options.quiet) {
    if (next.operation !== undefined && previous?.operation === undefined) {
      doc.push({ _tag: "headline", tone: "info", text: next.operation.name });
    }
    if (previous?.phase !== undefined && (next.phase !== previous.phase || settledNow)) {
      doc.push(...phaseConclusion(previous, next));
    }
    if (next.phase !== undefined && next.phase !== previous?.phase && !settledNow) {
      if (next.phase === "restoration") {
        doc.push({ _tag: "headline", tone: "warn", text: "Restoring affected changes" });
      } else if (options.static) {
        doc.push({ _tag: "headline", tone: "info", text: sentence(phaseLabel(next.phase)) });
      }
    }
  }
  const priorUnits = new Map(previous?.units.map((unit) => [unit.id, unit]));
  for (const unit of next.units) {
    const prior = priorUnits.get(unit.id);
    if (
      options.detailed &&
      !options.quiet &&
      unit.status === "running" &&
      prior?.status !== "running"
    ) {
      doc.push({ _tag: "headline", tone: "info", text: `Working on ${unit.label}` });
    }
    if (unit.status !== "running" && unit.status !== prior?.status) {
      if (incomplete(unit)) {
        const tone: Tone = unit.status === "failed" ? "error" : "warn";
        doc.push({
          _tag: "callout",
          tone,
          title: `${unit.label}: ${unitState(unit.status)}`,
          children: [
            {
              _tag: "paragraph",
              text: unit.failure?.detail ?? "No reason was reported.",
            },
          ],
        });
      } else if (
        options.detailed &&
        !options.quiet &&
        (unit.status === "committed" || unit.status === "unchanged")
      ) {
        doc.push({ _tag: "headline", tone: "ok", text: `Finished ${unit.label}` });
      }
    }
    const retry = unit.attempt === undefined ? undefined : retryAttempt(unit.attempt);
    if (!options.quiet && retry !== undefined && unit.attempt?.n !== prior?.attempt?.n) {
      doc.push({ _tag: "headline", tone: "info", text: `${unit.label}: ${retry}` });
    }
  }
  if (!options.quiet) {
    for (const wait of next.waiting) {
      if (
        previous?.waiting.some(
          (known) => known.subject === wait.subject && known.detail === wait.detail,
        )
      )
        continue;
      doc.push({
        _tag: "headline",
        tone: "warn",
        text: `${systemWaitStatus(wait.blockingClass)}${wait.detail.length === 0 ? "" : `: ${wait.detail}`}`,
      });
    }
    for (const wait of previous?.waiting ?? []) {
      if (!next.waiting.some((known) => known.subject === wait.subject)) {
        doc.push({
          _tag: "headline",
          tone: "info",
          text: `Wait ended${wait.detail.length === 0 ? "" : `: ${wait.detail}`}`,
        });
      }
    }
  }
  // The typed feature result owns the operation verdict. A successful Effect
  // can carry a failed or indeterminate product assessment, so do not infer it.
  const operation = next.operation?.name;
  return options.attributeOperation && operation !== undefined
    ? doc.map((node) => {
        if (node._tag === "headline" && plain(node.text) !== operation)
          return { ...node, text: `${operation}: ${plain(node.text)}` };
        if (node._tag === "callout")
          return { ...node, title: `${operation}: ${plain(node.title)}` };
        return node;
      })
    : doc;
};
