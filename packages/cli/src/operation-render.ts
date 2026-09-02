/**
 * Human console projection of an `OperationResolution`.
 *
 * One result-block grammar serves the whole plan family: the final block opens
 * with the terminal outcome, counts state what committed (considered and
 * unchanged are stated separately), apply-mode wording uses committed-state
 * language, and `--quiet` filters progress and decoration only — result rows,
 * outcomes, errors, and next-step guidance survive it.
 */

import * as Effect from "effect/Effect";
import { CliRenderer, count } from "./cli-renderer/index.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  countUnitStates,
  defaultOperationPresentation,
  deriveOperationOutcome,
  type JobStepArtifact,
  type OperationOutcome,
  type OperationResolution,
  type ResolvedUnit,
} from "@agentxm/workspace-operations";

const capitalize = (value: string): string =>
  value.length === 0 ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;

const artifactTargetPaths = (artifact: JobStepArtifact): string =>
  artifact.targets === undefined || artifact.targets.length === 0
    ? artifact.path
    : artifact.targets.map((target) => target.path).join(", ");

/** One result row per unit: label, version, change, file count, paths. */
const unitRow = (unit: ResolvedUnit<unknown>): string => {
  const artifact = unit.artifact;
  if (artifact === undefined) {
    const message = unit.message?.trim();
    return message === undefined || message.length === 0
      ? unit.label
      : `${unit.label}   ${message}`;
  }
  const details = [
    artifact.version,
    artifact.change,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    artifactTargetPaths(artifact),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return `${unit.label}   ${details.join("   ")}`;
};

const warningRows = (units: ReadonlyArray<ResolvedUnit<unknown>>): ReadonlyArray<string> =>
  units.flatMap((unit) => (unit.warnings ?? []).map((warning) => `${unit.label}: ${warning}`));

export interface AgentCoverageSummary {
  readonly agents: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}

/** Coding agents covered by the resolution's committed and unchanged units. */
export const resolutionAgentCoverage = (
  resolution: OperationResolution<unknown>,
): AgentCoverageSummary | undefined => {
  const agents = new Set<string>();
  let scope: "project" | "user" | undefined;
  for (const unit of resolution.units) {
    if (unit.state !== "committed" && unit.state !== "unchanged") continue;
    const artifact = unit.artifact;
    if (artifact?.agents === undefined) continue;
    scope ??= artifact.scope;
    for (const agent of artifact.agents) {
      if (agent !== "universal") agents.add(agent);
    }
  }
  return scope === undefined ? undefined : { agents: [...agents], scope };
};

const joinRows = (rows: ReadonlyArray<string>): string | undefined =>
  rows.length === 0 ? undefined : rows.join("\n");

export interface RenderOperationOptions {
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions?: boolean;
  /** Overrides the derived headline (no-op messages, divergence wording). */
  readonly message?: string;
}

/**
 * Render the terminal outcome of a resolved operation. The preview display is
 * rendered at planning time; a `previewed` outcome therefore renders nothing
 * further unless a flag-requested divergence must be stated.
 */
export const renderOperationOutcome = (
  resolution: OperationResolution<unknown>,
  options?: RenderOperationOptions,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const outcome: OperationOutcome = deriveOperationOutcome(resolution);
    const presentation = resolution.presentation ?? defaultOperationPresentation;
    const counts = countUnitStates(resolution.units);
    const suggestions = options?.suggestions ?? [];
    const suggestionOptions = {
      ...(suggestions.length === 0 ? {} : { suggestions }),
      ...(options?.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: options.withoutSuggestions }),
    };

    const subjectCount = (n: number): string =>
      count(n, presentation.subject.singular, presentation.subject.plural);

    const consideredRows = resolution.units
      .filter((unit) => unit.state === "committed" || unit.state === "unchanged")
      .map(unitRow);
    const skippedRows = resolution.units
      .filter((unit) => unit.state === "skipped")
      .map((unit) => unitRow(unit));
    const coverage = resolutionAgentCoverage(resolution);
    const coverageRow =
      coverage === undefined
        ? undefined
        : coverage.agents.length === 0
          ? "Agent coverage: none"
          : `Agent coverage: ${coverage.agents.join(", ")}`;

    switch (outcome) {
      case "previewed": {
        if (resolution.divergence === true) {
          yield* renderer.error(
            options?.message ??
              `Reconciliation is required — the workspace diverges from its desired state`,
            suggestionOptions,
          );
        }
        return;
      }
      case "applied": {
        const extras = [
          counts.unchanged > 0 ? `${counts.unchanged} unchanged` : undefined,
          counts.skipped > 0 ? `${counts.skipped} skipped` : undefined,
        ].filter((part): part is string => part !== undefined);
        const headline =
          options?.message ??
          `${presentation.verb.past} ${subjectCount(counts.committed)}${
            extras.length === 0 ? "" : ` (${extras.join(", ")})`
          }`;
        const summary = joinRows([
          ...consideredRows,
          ...skippedRows,
          ...warningRows(resolution.units),
          ...(coverageRow === undefined ? [] : [coverageRow]),
        ]);
        yield* renderer.success(headline, {
          ...(summary === undefined ? {} : { summary }),
          ...suggestionOptions,
        });
        if (coverage !== undefined && coverage.agents.length === 0) {
          yield* renderer.warn(
            `No coding-agent targets were materialized. Run \`axm agents add --detected${
              coverage.scope === "user" ? " --scope user" : ""
            }\`, then retry.`,
          );
        }
        return;
      }
      case "no-op": {
        const considered = counts.unchanged + counts.skipped;
        const headline =
          options?.message ??
          (considered === 0
            ? `Nothing to ${presentation.verb.imperative}`
            : `Already up to date — ${subjectCount(considered)}`);
        const summary = joinRows([
          ...consideredRows,
          ...skippedRows,
          ...warningRows(resolution.units),
        ]);
        yield* renderer.success(headline, {
          ...(summary === undefined ? {} : { summary }),
          ...suggestionOptions,
        });
        return;
      }
      case "partial": {
        const unfinished = counts.failed + counts.blocked;
        const headline = `Partially ${presentation.verb.past.toLowerCase()} — ${counts.committed} ${presentation.verb.past.toLowerCase()}, ${unfinished} ${counts.blocked > 0 && counts.failed === 0 ? "blocked" : "failed"}`;
        yield* renderer.error(headline, suggestionOptions);
        yield* renderFailureUnits(resolution.units, renderer);
        return;
      }
      case "failed": {
        const restored = counts.rolledBack > 0;
        const cause = resolution.failure?.detail;
        const headline = `Failed to ${presentation.verb.imperative} ${subjectCount(
          Math.max(counts.total, 1),
        )}${restored ? ` — all changes rolled back (${resolution.atomicity.applied})` : ""}`;
        yield* renderer.error(headline, suggestionOptions);
        if (cause !== undefined && cause.length > 0) {
          yield* renderer.error(`  ${cause}`);
        }
        const recovery = resolution.recovery;
        if (recovery !== undefined && recovery.retained.length > 0) {
          yield* renderer.error(
            `  restoration incomplete — ${count(recovery.retained.length, "path")} retained${
              recovery.snapshotDir === undefined
                ? ""
                : ` (pre-change snapshots preserved at ${recovery.snapshotDir})`
            }`,
          );
          for (const path of recovery.retained) {
            yield* renderer.error(`  retained: ${path}`);
          }
        }
        yield* renderFailureUnits(resolution.units, renderer);
        return;
      }
      case "blocked": {
        const blocking = resolution.blocking;
        const detail = blocking?.detail ?? "a blocking condition prevented execution";
        const headline =
          blocking?.class === "approval-required"
            ? "Approval required — no changes applied"
            : blocking?.class === "override-required"
              ? "Override required — no changes applied"
              : `${capitalize(presentation.verb.imperative)} is blocked — ${detail}`;
        yield* renderer.error(headline, suggestionOptions);
        if (
          blocking !== undefined &&
          (blocking.class === "approval-required" || blocking.class === "override-required") &&
          detail.length > 0
        ) {
          yield* renderer.error(`  ${detail}`);
        }
        return;
      }
      case "cancelled": {
        yield* renderer.info("Cancelled — no changes applied");
        return;
      }
      case "interrupted": {
        const disposition = resolution.interruption?.disposition ?? "none";
        const phrase =
          disposition === "restored"
            ? "changes rolled back"
            : disposition === "retained"
              ? "partial work retained"
              : "no changes applied";
        yield* renderer.error(`Interrupted — ${phrase}`, suggestionOptions);
        yield* renderFailureUnits(resolution.units, renderer);
        return;
      }
    }
  });

const renderFailureUnits = (
  units: ReadonlyArray<ResolvedUnit<unknown>>,
  renderer: typeof CliRenderer.Service,
) =>
  Effect.gen(function* () {
    for (const unit of units) {
      switch (unit.state) {
        case "committed":
          yield* renderer.success(`  ${unitRow(unit)}`);
          break;
        case "unchanged":
          yield* renderer.success(`  ${unit.label}   unchanged`);
          break;
        case "failed":
          yield* renderer.error(
            `  ${unit.label}: ${unit.message ?? unit.error?.detail ?? "failed"}`,
          );
          break;
        case "blocked":
          yield* renderer.warn(
            `  ${unit.label}: blocked${unit.blocking === undefined ? "" : ` (${unit.blocking.class})`} — ${unit.message ?? unit.blocking?.detail ?? ""}`,
          );
          break;
        case "rolled-back":
          yield* renderer.warn(`  ${unit.label}: rolled back`);
          break;
        case "interrupted":
          yield* renderer.warn(
            `  ${unit.label}: interrupted in flight — ${
              unit.disposition === "restored"
                ? "effects were restored"
                : unit.disposition === "unknown"
                  ? "settlement was not observed"
                  : "stopped"
            }`,
          );
          break;
        default:
          break;
      }
    }
  });
