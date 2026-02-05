/**
 * Shared plan display utilities for skills commands.
 *
 * Consolidates plan formatting logic used by install and uninstall handlers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import type { Clack } from "../../clack-effect/index.js";
import type { SkillSourceV2 } from "../../extensions/skills/state/types.js";
import type { Plan, PlanStep } from "../../workspace/index.js";
import { getPlanSummary, type PlanSummary } from "../../workspace/index.js";

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Get symbol for plan step type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getStepSymbol = (tag: PlanStep["_tag"]): string => {
  switch (tag) {
    case "InstallSkill":
      return "+";
    case "UpdateSkill":
      return "~";
    case "UninstallSkill":
      return "-";
    default: {
      // Exhaustive check
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
};

/**
 * Format hash for display (first 7 characters).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatHash = (hash: Option.Option<string>): string =>
  pipe(
    hash,
    Option.map((h) => {
      // Remove prefix like "sha256:" if present
      const stripped = h.includes(":") ? Option.getOrElse(Array.get(h.split(":"), 1), () => h) : h;
      return stripped.slice(0, 7);
    }),
    Option.getOrElse(() => "???????"),
  );

/**
 * Format source for display in plan output.
 * Uses V2 SkillSourceV2 type with Registry, GitHub, Local variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatSourceV2 = (source: SkillSourceV2): string => {
  switch (source._tag) {
    case "Local":
      return source.path;
    case "GitHub": {
      let result = `github:${source.owner}/${source.repo}`;
      if (Option.isSome(source.path)) {
        result += `/${source.path.value}`;
      }
      if (Option.isSome(source.ref)) {
        result += `@${source.ref.value}`;
      }
      return result;
    }
    case "Registry": {
      let result = `@${source.scope}/${source.name}`;
      if (Option.isSome(source.version)) {
        result += `@${source.version.value}`;
      }
      return result;
    }
  }
};

/**
 * Format a single plan step for display.
 *
 * @param step - The plan step to format
 * @param displaySource - Optional display source string (for showing original source instead of cached path)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatPlanStep = (step: PlanStep, displaySource?: string): string => {
  const symbol = getStepSymbol(step._tag);

  switch (step._tag) {
    case "InstallSkill": {
      const source = displaySource ?? formatSourceV2(step.source);
      return `  ${symbol} ${step.skill.padEnd(20)} ${source}`;
    }
    case "UpdateSkill": {
      const fromHash = formatHash(step.fromHash);
      const toHash = formatHash(step.toHash);
      return `  ${symbol} ${step.skill.padEnd(20)} ${fromHash} -> ${toHash}`;
    }
    case "UninstallSkill": {
      const agentInfo = step.agents.length > 0 ? ` @ ${step.agents.join(", ")}` : "";
      return `  ${symbol} ${step.skill.padEnd(20)}${agentInfo} (remove)`;
    }
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
};

/**
 * Format summary line for plan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const formatPlanSummary = (summary: PlanSummary): string => {
  const parts: string[] = [];
  if (summary.installed > 0) parts.push(`${summary.installed} to install`);
  if (summary.updated > 0) parts.push(`${summary.updated} to update`);
  if (summary.uninstalled > 0) parts.push(`${summary.uninstalled} to uninstall`);
  return parts.length > 0 ? parts.join(", ") : "No changes";
};

// =============================================================================
// Clack Integration
// =============================================================================

/**
 * Display the plan in human-readable format using Clack.
 *
 * @param clack - The Clack service instance
 * @param plan - The plan to display
 * @param displaySource - Optional display source string (for showing original source instead of cached path)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const displayPlan = (
  clack: Clack["Type"],
  plan: Plan,
  displaySource?: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (plan.steps.length === 0) {
      return;
    }

    yield* clack.log.info("Plan:");
    yield* clack.log.message("");
    yield* clack.log.message("  Skills:");

    for (const step of plan.steps) {
      yield* clack.log.message(formatPlanStep(step, displaySource));
    }

    const summary = getPlanSummary(plan);
    yield* clack.log.message("");
    yield* clack.log.message(`  Summary: ${formatPlanSummary(summary)}`);
  });
