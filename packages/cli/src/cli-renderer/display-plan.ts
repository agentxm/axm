/**
 * Planned-candidate display.
 *
 * Renders the human-readable orientation for a plan candidate before it is
 * previewed or confirmed. Wording comes from the plan's typed presentation
 * vocabulary — never from parsing plan names. The terminal result of an
 * executed operation is rendered from its `OperationResolution` at the emit
 * boundary, not here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { CliRenderer } from "./cli-renderer.js";
import { count } from "./count.js";
import { Verbosity } from "../cli-flags/index.js";
import {
  presentationOf,
  type Plan,
  type PlanRiskCondition,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";

const renderPlannedStep = (
  step: PlannedJobStep<unknown, unknown>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) =>
  Effect.gen(function* () {
    switch (step.readiness) {
      case "ready":
        yield* renderer.success(
          step.message === undefined ? `  + ${step.label}` : `  + ${step.label} (${step.message})`,
        );
        break;
      case "warn":
        yield* renderer.warn(`  ${step.label} (${step.warnMessage})`);
        break;
      case "error":
        yield* renderer.error(`  ${step.label} (${step.errorMessage})`);
        break;
    }

    const stepOutcomes = step.agentOutcomes ?? [];
    for (const { agentId, outcome, reason, mechanism, path } of stepOutcomes) {
      yield* renderer.message(
        `    ${agentId}: ${outcome}${mechanism === undefined ? "" : ` (${mechanism})`}${path === undefined ? "" : ` -> ${path}`} — ${reason}`,
      );
    }
    if (step.artifact === undefined) return;
    const targets =
      step.artifact.targets === undefined || step.artifact.targets.length === 0
        ? [{ path: step.artifact.path, change: step.artifact.change }]
        : step.artifact.targets;
    for (const target of targets) {
      yield* renderer.message(`    ${target.change}: ${target.path}`);
    }
    for (const { agentId, outcome, reason, mechanism, path } of stepOutcomes.length === 0
      ? (step.artifact.agentOutcomes ?? [])
      : []) {
      yield* renderer.message(
        `    ${agentId}: ${outcome}${mechanism === undefined ? "" : ` (${mechanism})`}${path === undefined ? "" : ` -> ${path}`} — ${reason}`,
      );
    }
  });

// Risk conditions render as warnings so they survive `--quiet`, which filters
// progress and decoration only.
const renderRiskConditions = (
  conditions: ReadonlyArray<PlanRiskCondition>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) =>
  Effect.forEach(conditions, (condition) => renderer.warn(condition.detail), {
    discard: true,
  });

/**
 * Display a plan candidate.
 *
 * - `preview` renders conditional wording ("Would …", "N to apply").
 * - `apply` renders orientation only when the candidate carries confirmable
 *   risk — the wording states what is about to be done, never preview
 *   phrasing; without confirmable risk nothing is rendered, because the
 *   terminal resolution is the durable output.
 */
export const displayPlan = (
  plan: Plan<unknown, unknown>,
  options?: { readonly mode?: "preview" | "apply" },
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const v = yield* Verbosity;
    const mode = options?.mode ?? "preview";

    const allSteps = plan.jobs.flatMap((job) => [...job.steps]);
    if (allSteps.length === 0) return;

    const presentation = presentationOf(plan);
    const conditions = plan.riskConditions ?? [];
    const hasConfirmableRisk = conditions.some((condition) => condition.level === "confirmable");

    if (mode === "apply" && !hasConfirmableRisk) return;

    const subjectCount = count(
      allSteps.length,
      presentation.subject.singular,
      presentation.subject.plural,
    );
    const headline =
      mode === "preview"
        ? `Would ${presentation.verb.imperative} ${subjectCount}`
        : `Ready to ${presentation.verb.imperative} ${subjectCount}`;
    const heading = Option.match(plan.description, {
      onNone: () => headline,
      onSome: (description) => `${headline}\n${description}`,
    });

    if (v.level === "quiet" && mode === "preview") {
      yield* renderer.success(heading.split("\n")[0] ?? heading);
      yield* renderRiskConditions(conditions, renderer);
      return;
    }

    yield* renderer.info(heading);
    for (const step of allSteps) {
      yield* renderPlannedStep(step, renderer);
    }

    if (mode === "preview") {
      const readyCount = allSteps.filter((s) => s.readiness === "ready").length;
      const warnCount = allSteps.filter((s) => s.readiness === "warn").length;
      const errorCount = allSteps.filter((s) => s.readiness === "error").length;
      const parts: string[] = [];
      if (readyCount > 0) parts.push(`${readyCount} to apply`);
      if (errorCount > 0) parts.push(count(errorCount, "error"));
      if (warnCount > 0) parts.push(count(warnCount, "warning", "warnings"));
      if (parts.length > 0) {
        yield* renderer.message(parts.join(", "));
      }
    }

    yield* renderRiskConditions(conditions, renderer);
  });
