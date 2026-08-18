import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { serializeErrorCauseChain } from "@agentxm/client-core/unstable/app-error";
import type {
  CompletedJobStep,
  ExecutedPlan,
  JobStepArtifact,
  PlanResolution,
} from "@agentxm/client-core/unstable/plan";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { suggestionsForScope } from "./scoped-command.js";

const formatArtifactTargets = (artifact: JobStepArtifact): string => {
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact.path;
  }
  return artifact.targets
    .map((target) => {
      const agents =
        target.agentIds === undefined || target.agentIds.length === 0
          ? undefined
          : ` [${target.agentIds.join(", ")}]`;
      return `${target.path} (${target.change})${agents ?? ""}`;
    })
    .join(", ");
};

const formatArtifactSource = (artifact: JobStepArtifact): string | undefined => {
  if (artifact.source === undefined) return undefined;
  const source = artifact.source;
  const details = [
    `${source.type} ${source.origin}`,
    source.ref === undefined ? undefined : `ref ${source.ref}`,
    source.directory === undefined ? undefined : `dir ${source.directory}`,
    source.gitTreeHash === undefined ? undefined : `tree ${source.gitTreeHash}`,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return details.length === 0 ? undefined : `  source: ${details.join("   ")}`;
};

const formatAgentOutcomes = (artifact: JobStepArtifact): string | undefined => {
  if (artifact.agentOutcomes === undefined || artifact.agentOutcomes.length === 0) return undefined;
  return artifact.agentOutcomes
    .map(
      ({ agentId, outcome, reason, mechanism, path }) =>
        `  ${agentId}: ${outcome}${mechanism === undefined ? "" : ` (${mechanism})`}${path === undefined ? "" : ` -> ${path}`} — ${reason}`,
    )
    .join("\n");
};

const formatCompletedArtifactStep = (
  step: CompletedJobStep<unknown>,
  options: { readonly debug?: boolean } = {},
): string | undefined => {
  if (step.result.result !== "success" || step.result.artifact === undefined) return undefined;
  const artifact = step.result.artifact;
  const details = [
    artifact.change,
    artifact.mechanism,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    formatArtifactTargets(artifact),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  const row = `${step.label}   ${details.join("   ")}`;
  const outcomes = formatAgentOutcomes(artifact);
  const rowWithOutcomes = outcomes === undefined ? row : `${row}\n${outcomes}`;
  if (options.debug !== true) return rowWithOutcomes;
  const source = formatArtifactSource(artifact);
  return source === undefined ? rowWithOutcomes : `${rowWithOutcomes}\n${source}`;
};

const formatFailedStep = (
  step: CompletedJobStep<unknown>,
  options: { readonly verbose?: boolean; readonly debug?: boolean } = {},
): string | undefined => {
  if (step.result.result !== "error") return undefined;
  const message = step.result.message.trim();
  const row =
    message.length === 0
      ? `${step.label}   failed   ${step.result.error.code}`
      : `${step.label}   failed   ${message}`;
  if (options.verbose !== true && options.debug !== true) return row;

  const causes = serializeErrorCauseChain(step.result.error.cause, {
    debug: options.debug === true,
  });
  if (causes.length === 0) return row;

  const causeRows = causes.map((cause) => {
    const code = cause.code === undefined ? "" : ` ${cause.code}`;
    const stack = options.debug === true && cause.stack !== undefined ? `\n${cause.stack}` : "";
    return `  cause: ${cause._tag}${code}: ${cause.message}${stack}`;
  });
  return [row, ...causeRows].join("\n");
};

const formatPlainSuccessStep = (step: CompletedJobStep<unknown>): string | undefined => {
  if (step.result.result !== "success" || step.result.artifact !== undefined) return undefined;
  const message = step.result.message.trim();
  const outcomes = (step.agentOutcomes ?? [])
    .map(
      ({ agentId, outcome, reason, mechanism, path }) =>
        `  ${agentId}: ${outcome}${mechanism === undefined ? "" : ` (${mechanism})`}${path === undefined ? "" : ` -> ${path}`} — ${reason}`,
    )
    .join("\n");
  const row = message.length === 0 ? step.label : `${step.label}   ${message}`;
  return outcomes.length === 0 ? (message.length === 0 ? undefined : row) : `${row}\n${outcomes}`;
};

export const summarizeExecutedArtifacts = (plan: ExecutedPlan<unknown>): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const summary = formatCompletedArtifactStep(step);
      return summary === undefined ? [] : [summary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

export const summarizeExecutedOutcome = (
  plan: ExecutedPlan<unknown>,
  options: { readonly verbose?: boolean; readonly debug?: boolean } = {},
): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const artifactSummary = formatCompletedArtifactStep(step, { debug: options.debug === true });
      if (artifactSummary !== undefined) return [artifactSummary];
      const successSummary = formatPlainSuccessStep(step);
      if (successSummary !== undefined) return [successSummary];
      const failedSummary = formatFailedStep(step, options);
      return failedSummary === undefined ? [] : [failedSummary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

const hasFailedSteps = (plan: ExecutedPlan<unknown>): boolean =>
  plan.jobs.some((job) => job.steps.some((step) => step.result.result === "error"));

export const failureHeadline = (headline: string): string => {
  if (headline.startsWith("Installed ")) {
    return `Failed to install ${headline.slice("Installed ".length)}`;
  }
  if (headline.startsWith("Uninstalled ")) {
    return `Failed to uninstall ${headline.slice("Uninstalled ".length)}`;
  }
  if (headline.startsWith("Enabled ")) {
    return `Failed to enable ${headline.slice("Enabled ".length)}`;
  }
  if (headline.startsWith("Disabled ")) {
    return `Failed to disable ${headline.slice("Disabled ".length)}`;
  }
  if (headline.startsWith("Pruned ")) {
    return `Failed to prune ${headline.slice("Pruned ".length)}`;
  }
  if (headline.startsWith("Configured ")) {
    return `Failed to configure ${headline.slice("Configured ".length)}`;
  }
  if (headline.startsWith("Removed ")) {
    return `Failed to remove ${headline.slice("Removed ".length)}`;
  }
  return `Failed: ${headline}`;
};

const defaultFailureSuggestions: ReadonlyArray<SuggestedAction> = [
  { description: "Review the failed step above, fix the source or workspace state, and retry." },
];

export interface InstallationCoverage {
  readonly agents: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}

export const installationCoverage = (
  plan: ExecutedPlan<unknown>,
): InstallationCoverage | undefined => {
  const agents = new Set<string>();
  let scope: "project" | "user" | undefined;

  for (const step of plan.jobs.flatMap((job) => job.steps)) {
    if (step.result.result !== "success" || step.result.artifact === undefined) continue;
    const artifact = step.result.artifact;
    if (artifact.agents === undefined) continue;
    if (scope === undefined) {
      scope = artifact.scope;
    } else if (scope !== artifact.scope) {
      throw new Error(`Installation coverage spans ${scope} and ${artifact.scope} scopes`);
    }
    const artifactAgents = new Set(artifact.agents);
    for (const target of artifact.targets ?? []) {
      for (const agent of target.agentIds ?? []) {
        if (!artifactAgents.has(agent)) {
          throw new Error(`Artifact target agent ${agent} is absent from artifact agents`);
        }
      }
    }
    for (const agent of artifact.agents) {
      if (agent !== "universal") agents.add(agent);
    }
  }

  return scope === undefined ? undefined : { agents: [...agents], scope };
};

const appendSummary = (summary: string | undefined, line: string): string =>
  summary === undefined ? line : `${summary}\n${line}`;

const materializationSuggestion = (scope: InstallationCoverage["scope"]): SuggestedAction => ({
  description: "Detect and configure an active coding agent, then reinstall.",
  cmd: `axm agents add --detected${scope === "user" ? " --scope user" : ""}`,
});

const materializationWarning = (scope: InstallationCoverage["scope"]): string =>
  `No coding-agent targets were materialized. Run \`axm agents add --detected${scope === "user" ? " --scope user" : ""}\`, then reinstall.`;

export const unchangedPlanHeadline = (
  resolution: PlanResolution<unknown, unknown>,
  fallback: string,
): string => {
  if (resolution._tag !== "ExecutedPlan") return fallback;

  const unchangedStep = resolution.jobs
    .flatMap((job) => job.steps)
    .find(
      (step) => step.result.result === "success" && step.result.artifact?.change === "unchanged",
    );
  if (unchangedStep === undefined || unchangedStep.result.result !== "success") {
    return fallback;
  }

  const version = unchangedStep.result.artifact?.version;
  return `Already up to date — ${unchangedStep.label}${version === undefined ? "" : ` ${version}`}`;
};

export const emitAppliedPlanOutcome = <TCommand extends string>(args: {
  readonly command: TCommand;
  readonly headline: string;
  readonly resolution: PlanResolution<unknown, unknown>;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly failureSuggestions?: ReadonlyArray<SuggestedAction>;
  readonly reportInstallationCoverage?: boolean;
}) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    const ws = yield* WorkspaceMutations;
    const failed =
      args.resolution._tag === "ExecutedPlan" ? hasFailedSteps(args.resolution) : false;
    const coverage =
      args.reportInstallationCoverage === true && args.resolution._tag === "ExecutedPlan" && !failed
        ? installationCoverage(args.resolution)
        : undefined;
    const baseSuggestions = suggestionsForScope(
      failed ? (args.failureSuggestions ?? defaultFailureSuggestions) : args.suggestions,
      ws.scope,
    );
    const suggestions =
      coverage !== undefined && coverage.agents.length === 0
        ? [materializationSuggestion(coverage.scope), ...baseSuggestions]
        : baseSuggestions;
    const outcomeSummary =
      args.resolution._tag === "ExecutedPlan"
        ? summarizeExecutedOutcome(args.resolution, {
            verbose: verbosity.isAtLeast("verbose"),
            debug: verbosity.level === "debug",
          })
        : undefined;
    const summary =
      coverage === undefined
        ? outcomeSummary
        : appendSummary(
            outcomeSummary,
            coverage.agents.length === 0
              ? "Agent coverage: none"
              : `Agent coverage: ${coverage.agents.join(", ")}`,
          );
    const resultOptions = summary === undefined ? { suggestions } : { summary, suggestions };
    const emitted = yield* emitPlanResolutionResult(
      args.command,
      args.resolution,
      args.resolution._tag === "ExecutedPlan"
        ? {
            ...resultOptions,
            ...(coverage === undefined ? {} : { agentCoverage: coverage }),
          }
        : undefined,
    );

    if (args.resolution._tag === "ExecutedPlan") {
      const renderer = yield* CliRenderer;
      if (verbosity.isAtLeast("verbose")) {
        const description = Option.getOrUndefined(args.resolution.description);
        if (description !== undefined && description.length > 0) {
          yield* renderer.info(description);
        }
      }
      const successOptions =
        summary === undefined
          ? { suggestions, withoutSuggestions: emitted }
          : { summary, suggestions, withoutSuggestions: emitted };
      if (failed) {
        if (verbosity.level === "quiet") {
          yield* renderer.error(failureHeadline(args.headline));
          return;
        }
        yield* renderer.error(failureHeadline(args.headline), {
          suggestions,
          withoutSuggestions: emitted,
        });
        if (summary !== undefined) {
          yield* renderer.info(summary);
        }
        return;
      }
      yield* renderer.success(
        args.headline,
        verbosity.level === "quiet" ? undefined : successOptions,
      );
      if (coverage !== undefined && coverage.agents.length === 0 && verbosity.level !== "quiet") {
        yield* renderer.warn(materializationWarning(coverage.scope));
      }
    }
  });
