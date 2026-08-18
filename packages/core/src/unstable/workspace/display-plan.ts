/**
 * Shared plan display module.
 *
 * Renders a human-readable summary of a Plan or ExecutedPlan via the CliRenderer service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as EffectRecord from "effect/Record";
import * as ServiceMap from "effect/Context";
import { CliRenderer } from "../cli-renderer/index.js";
import {
  EXTENSION_TYPE_TABLE,
  toExtensionTypePlural,
  type ExtensionType,
} from "../extensions/common.js";
import { count } from "../cli-renderer/index.js";
import { Verbosity } from "../cli-flags/index.js";
import { renderAppError } from "../app-error/index.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import type {
  CompletedJobStep,
  ExecutedPlan,
  JobStepArtifact,
  Plan,
  PlanSection,
  PlannedJobStep,
} from "../plan/plan.js";

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------

/**
 * Display a plan or executed plan summary via the CliRenderer service.
 *
 * Reads verbosity settings from the `Verbosity` service.
 */
export const displayPlan = (plan: Plan<unknown, unknown> | ExecutedPlan<unknown>) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const v = yield* Verbosity;
    const verbosity: {
      readonly verbose: boolean;
      readonly debug: boolean;
      readonly quiet: boolean;
    } = {
      verbose: v.isAtLeast("verbose"),
      debug: v.isAtLeast("debug"),
      quiet: v.level === "quiet",
    };

    const renderHeading = Option.match(plan.description, {
      onNone: () => plan.name,
      onSome: (desc) => `${plan.name}\n${desc}`,
    });

    // Determine if this is an executed plan using _tag discriminant
    const firstJob = plan.jobs[0];
    if (!firstJob || firstJob.steps.length === 0) {
      return;
    }

    if (plan._tag === "ExecutedPlan") {
      const allSteps = plan.jobs.flatMap((job) => [...job.steps]);
      const hasFailures = allSteps.some((step) => step.result.result === "error");
      if (!hasFailures) {
        yield* renderExecutedOutcome(plan, allSteps, renderer, verbosity);
        if (!verbosity.verbose) {
          return;
        }
      }

      if (hasFailures) {
        yield* renderer.error(`${countFailedSteps(allSteps)} failed in ${plan.name}`);
      }

      if (verbosity.verbose) {
        yield* renderer.info(renderHeading);
      }
      for (const step of allSteps) {
        yield* renderCompletedStep(step, renderer, verbosity);
      }
      yield* renderCompletedSummary(allSteps, renderer);
    } else {
      const allSteps = plan.jobs.flatMap((job) => [...job.steps]);
      const plannedHeading = renderPlannedHeading(plan, allSteps);
      yield* renderer.info(
        verbosity.quiet ? (plannedHeading.split("\n")[0] ?? plannedHeading) : plannedHeading,
      );
      if (verbosity.quiet) {
        return;
      }
      for (const step of allSteps) {
        yield* renderPlannedStep(step, renderer);
      }
      yield* renderPlannedSummary(allSteps, renderer);

      // Render optional sections (e.g., compatible packages)
      if (plan.sections !== undefined) {
        for (const section of plan.sections) {
          yield* renderSection(section, renderer);
        }
      }
    }
  });

const countFailedSteps = (allSteps: ReadonlyArray<CompletedJobStep<unknown>>): string => {
  const failCount = allSteps.filter((step) => step.result.result === "error").length;
  return count(failCount, "step");
};

const successMessages = (
  allSteps: ReadonlyArray<CompletedJobStep<unknown>>,
): ReadonlyArray<string> =>
  allSteps.flatMap((step) =>
    step.result.result === "success" && step.result.message.length > 0 ? [step.result.message] : [],
  );

const successWarnings = (
  allSteps: ReadonlyArray<CompletedJobStep<unknown>>,
): ReadonlyArray<string> =>
  allSteps.flatMap((step) =>
    step.result.result === "success" && step.result.warnings !== undefined
      ? step.result.warnings.map((warning) => `${step.label}: ${warning}`)
      : [],
  );

const joinSummary = (...parts: ReadonlyArray<string | undefined>): string | undefined => {
  const present = parts.filter((part): part is string => part !== undefined && part.length > 0);
  return present.length === 0 ? undefined : present.join("\n");
};

const renderSection = (
  section: PlanSection,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) =>
  Effect.gen(function* () {
    if (section.items.length === 0) return;
    yield* renderer.message(`${section.title}:`);
    for (const item of section.items) {
      yield* renderer.message(`  ${item}`);
    }
  });

const plannedVerb = (planName: string): string => {
  const lower = planName.toLowerCase();
  if (lower.includes("prune")) return "prune";
  if (lower.includes("unpack")) return "unpack";
  if (lower.includes("uninstall") || lower.includes("remove")) return "remove";
  if (lower.includes("disable")) return "disable";
  if (lower.includes("enable")) return "enable";
  if (lower.includes("install")) return "install";
  if (lower.includes("update")) return "update";
  if (lower.includes("import")) return "import";
  if (lower.includes("publish")) return "publish";
  if (lower.includes("create") || lower.includes("new")) return "create";
  return "apply";
};

const renderPlannedHeading = (
  plan: Plan<unknown, unknown>,
  allSteps: ReadonlyArray<PlannedJobStep<unknown, unknown>>,
): string => {
  if (plan.name === "Add MCP server") {
    const headline = `Would apply ${count(allSteps.length, "change")}`;
    return Option.match(plan.description, {
      onNone: () => headline,
      onSome: (description) => `${headline}\n${description}`,
    });
  }

  const type = artifactType(plan.name);
  const headline = `Would ${plannedVerb(plan.name)} ${count(
    allSteps.length,
    type,
    artifactPluralType(type),
  )}`;
  return Option.match(plan.description, {
    onNone: () => headline,
    onSome: (description) => `${headline}\n${description}`,
  });
};

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

    if (step.artifact === undefined) return;
    const targets =
      step.artifact.targets === undefined || step.artifact.targets.length === 0
        ? [{ path: step.artifact.path, change: step.artifact.change }]
        : step.artifact.targets;
    for (const target of targets) {
      yield* renderer.message(`    ${target.change}: ${target.path}`);
    }
    for (const { agent, outcome, reason, path } of step.artifact.agentOutcomes ?? []) {
      yield* renderer.message(
        `    ${agent}: ${outcome}${path === undefined ? "" : ` -> ${path}`} — ${reason}`,
      );
    }
  });

const renderCompletedStep = (
  step: CompletedJobStep<unknown>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  verbosity: { readonly verbose: boolean; readonly debug: boolean; readonly quiet: boolean },
) => {
  switch (step.result.result) {
    case "success": {
      const suffix = step.result.message.length > 0 ? ` (${step.result.message})` : "";
      return renderer.success(`  ${step.label}${suffix}`);
    }
    case "error": {
      const renderedLines = renderAppError(step.result.error, verbosity).split("\n");
      const [firstLine, ...rest] = renderedLines;
      const first = firstLine ?? step.result.message;
      const headline = first.startsWith("\u2716 ") ? first.slice(2) : first;

      return Effect.gen(function* () {
        yield* renderer.error(`  ${step.label}: ${headline}`);
        for (const line of rest) {
          yield* renderer.error(`    ${line.trimStart()}`);
        }
      });
    }
  }
};

const renderPlannedSummary = (
  allSteps: ReadonlyArray<PlannedJobStep<unknown, unknown>>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) =>
  Effect.gen(function* () {
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
  });

const renderCompletedSummary = (
  allSteps: ReadonlyArray<CompletedJobStep<unknown>>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
) =>
  Effect.gen(function* () {
    const appliedCount = allSteps.filter(
      (s) =>
        s.result.result === "success" &&
        (s.result.artifact === undefined || s.result.artifact.change !== "unchanged"),
    ).length;
    const unchangedCount = allSteps.filter(
      (s) => s.result.result === "success" && s.result.artifact?.change === "unchanged",
    ).length;
    const failCount = allSteps.filter((s) => s.result.result === "error").length;

    const parts: string[] = [];
    if (appliedCount > 0) parts.push(`${appliedCount} applied`);
    if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
    if (failCount > 0) parts.push(`${failCount} failed`);

    if (parts.length > 0) {
      yield* renderer.message(parts.join(", "));
    }
  });

const operationVerb = (planName: string): string => {
  const lower = planName.toLowerCase();
  if (lower.includes("prune")) return "Pruned";
  if (lower.includes("unpack")) return "Unpacked";
  if (lower.includes("uninstall") || lower.includes("remove")) return "Uninstalled";
  if (lower.includes("disable")) return "Disabled";
  if (lower.includes("enable")) return "Enabled";
  if (lower.includes("install")) return "Installed";
  if (lower.includes("update")) return "Updated";
  if (lower.includes("import")) return "Imported";
  if (lower.includes("sync")) return "Synced";
  if (lower.includes("publish")) return "Published";
  if (lower.includes("create") || lower.includes("new")) return "Created";
  return "Applied";
};

/**
 * Extension-type names a plan name can mention, derived from the type table so
 * a new type is recognized without editing this file. Each row contributes
 * every spelling it publishes — id, plural segment, and the display labels —
 * and the longest token wins so `mcp servers` beats `mcps` and `skills` beats
 * `skill`.
 */
const artifactTypeTokens: ReadonlyArray<{
  readonly token: string;
  readonly singular: string;
  readonly plural: string;
}> = EffectRecord.toEntries(EXTENSION_TYPE_TABLE)
  .flatMap(([id, row]) =>
    [
      id,
      row.plural,
      row.sentenceLabel,
      row.pluralSentenceLabel,
      row.label.toLowerCase(),
      row.pluralLabel.toLowerCase(),
    ].map((token) => ({
      token,
      singular: row.sentenceLabel,
      plural: row.pluralSentenceLabel,
    })),
  )
  .sort((left, right) => right.token.length - left.token.length);

/**
 * Plan-scoped names that are not extension types. Checked before the type
 * table because their wording overlaps it — "instruction-file management"
 * would otherwise be read as a file plan.
 */
const NON_TYPE_ARTIFACT_NAMES: ReadonlyArray<{
  readonly match: string;
  readonly singular: string;
  readonly plural: string;
}> = [
  {
    match: "instruction-file",
    singular: "instruction-file management",
    plural: "instruction-file management",
  },
  { match: "configured extension", singular: "extension", plural: "extensions" },
];

/** Plan verbs that name an operation rather than a type. */
const OPERATION_ARTIFACT_NAMES: ReadonlyArray<{
  readonly match: string;
  readonly singular: string;
  readonly plural: string;
}> = [
  { match: "sync", singular: "workspace item", plural: "workspace items" },
  { match: "prune", singular: "artifact", plural: "artifacts" },
];

const artifactNames = (
  planName: string,
): { readonly singular: string; readonly plural: string } => {
  const lower = planName.toLowerCase();
  for (const entry of NON_TYPE_ARTIFACT_NAMES) {
    if (lower.includes(entry.match)) return entry;
  }
  for (const entry of artifactTypeTokens) {
    if (lower.includes(entry.token)) return entry;
  }
  for (const entry of OPERATION_ARTIFACT_NAMES) {
    if (lower.includes(entry.match)) return entry;
  }
  return { singular: "step", plural: "steps" };
};

const artifactType = (planName: string): string => artifactNames(planName).singular;

// eslint-disable-next-line no-restricted-syntax -- Immutable lookup over the closed extension-type vocabulary.
const pluralByArtifactType: ReadonlyMap<string, string> = new Map([
  ...artifactTypeTokens.map((entry): readonly [string, string] => [entry.singular, entry.plural]),
  ...NON_TYPE_ARTIFACT_NAMES.map((entry): readonly [string, string] => [
    entry.singular,
    entry.plural,
  ]),
  ...OPERATION_ARTIFACT_NAMES.map((entry): readonly [string, string] => [
    entry.singular,
    entry.plural,
  ]),
]);

const artifactPluralType = (type: string): string => pluralByArtifactType.get(type) ?? `${type}s`;

const scopePhrase = (scope: JobStepArtifact["scope"]): string =>
  scope === "project" ? "this project" : "user scope";

const artifactTargetPhrase = (artifact: JobStepArtifact): string | undefined =>
  artifact.agents !== undefined && artifact.agents.length > 0
    ? `for ${count(artifact.agents.length, "agent")}`
    : artifact.targets === undefined || artifact.targets.length === 0
      ? undefined
      : `for ${count(artifact.targets.length, "location")}`;

const formatArtifactSummary = (artifact: JobStepArtifact, verbose: boolean): string => {
  const outcomeRows = (artifact.agentOutcomes ?? []).map(
    ({ agent, outcome, reason, path }) =>
      `   ${agent}: ${outcome}${path === undefined ? "" : ` -> ${path}`} — ${reason}`,
  );
  const details = [
    artifact.version,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  if (artifact.targets !== undefined && artifact.targets.length > 0) {
    const summary =
      details.length === 0
        ? `-> ${count(artifact.targets.length, "location")}`
        : `-> ${count(artifact.targets.length, "location")}   ${details.join(" | ")}`;
    if (!verbose && outcomeRows.length === 0) return summary;
    const rows = artifact.targets.map((target) => {
      const agents =
        target.agentIds === undefined || target.agentIds.length === 0
          ? undefined
          : target.agentIds.join(", ");
      return agents === undefined
        ? `   -> ${target.path}   ${target.change}`
        : `   -> ${target.path}   ${target.change}   ${agents}`;
    });
    return [summary, ...rows, ...outcomeRows].join("\n");
  }
  const summary =
    details.length === 0 ? `-> ${artifact.path}` : `-> ${artifact.path}   ${details.join(" | ")}`;
  return outcomeRows.length === 0 ? summary : [summary, ...outcomeRows].join("\n");
};

const formatArtifactRow = (step: CompletedJobStep<unknown>, artifact: JobStepArtifact): string => {
  const targetPaths =
    artifact.targets === undefined || artifact.targets.length === 0
      ? artifact.path
      : artifact.targets.map((target) => target.path).join(", ");
  const details = [
    artifact.version,
    artifact.change,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    targetPaths,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return `${step.label}   ${details.join("   ")}`;
};

const cleanStepLabel = (label: string): string => {
  const parenIndex = label.indexOf(" (");
  return parenIndex === -1 ? label : label.slice(0, parenIndex);
};

const singleArtifactSuggestions = (
  type: string,
  label: string,
  artifact: JobStepArtifact,
  verb: string,
): ReadonlyArray<SuggestedAction> | undefined => {
  const target = cleanStepLabel(label);
  const suggestions = inspectSuggestionsForType(type);
  if (suggestions === undefined) return undefined;
  const actions = [...suggestions];

  if (artifact.change === "removed") {
    return actions;
  }

  if (verb === "Enabled") {
    actions.push({
      description: "Undo",
      cmd: inverseCommand(type, "disable", target),
    });
    return actions;
  }

  if (verb === "Disabled") {
    actions.push({ description: "Undo", cmd: inverseCommand(type, "enable", target) });
    return actions;
  }

  const uninstallGroup = uninstallCommandGroupForType(type);
  if (uninstallGroup !== undefined) {
    actions.push({ description: "Undo", cmd: `axm ${uninstallGroup} uninstall ${target}` });
  }
  return actions;
};

const inspectSuggestionsForType = (type: string): ReadonlyArray<SuggestedAction> | undefined => {
  const listCommand = listCommandForType(type);
  if (listCommand === undefined) return undefined;
  return [{ description: inspectDescriptionForType(type), cmd: listCommand }];
};

/**
 * Display label back to type id. Plan summaries carry the sentence label, so
 * this is how a suggestion recovers which command group to point at without a
 * hand-written switch of its own.
 */
// eslint-disable-next-line no-restricted-syntax -- Immutable lookup over the closed extension-type vocabulary.
const extensionTypeByArtifactName: ReadonlyMap<string, ExtensionType> = new Map(
  EffectRecord.toEntries(EXTENSION_TYPE_TABLE).map(
    ([id, row]): readonly [string, ExtensionType] => [row.sentenceLabel, id],
  ),
);

const INSTRUCTIONS_ARTIFACT = "instruction-file management";

const commandGroupForType = (type: string): string => {
  const extensionType = extensionTypeByArtifactName.get(type);
  return extensionType === undefined ? "install" : toExtensionTypePlural(extensionType);
};

const inverseCommand = (type: string, verb: "enable" | "disable", target: string): string =>
  type === INSTRUCTIONS_ARTIFACT
    ? `axm instructions ${verb}`
    : `axm ${commandGroupForType(type)} ${verb} ${target}`;

const listCommandForType = (type: string): string | undefined => {
  if (type === INSTRUCTIONS_ARTIFACT) return "axm instructions";
  const extensionType = extensionTypeByArtifactName.get(type);
  return extensionType === undefined
    ? undefined
    : `axm ${toExtensionTypePlural(extensionType)} list`;
};

const uninstallCommandGroupForType = (type: string): string | undefined => {
  const extensionType = extensionTypeByArtifactName.get(type);
  return extensionType === undefined ? undefined : toExtensionTypePlural(extensionType);
};

const inspectDescriptionForType = (type: string): string =>
  type === INSTRUCTIONS_ARTIFACT
    ? "Inspect instruction-file management"
    : `Inspect installed ${artifactPluralType(type)}`;

const unchangedHeadline = (step: CompletedJobStep<unknown>, artifact: JobStepArtifact): string => {
  const version = artifact.version === undefined ? "" : ` ${artifact.version}`;
  return `Already up to date — ${step.label}${version}`;
};

const singleArtifactHeadline = (
  verb: string,
  type: string,
  step: CompletedJobStep<unknown>,
  artifact: JobStepArtifact,
  options?: { readonly configured: boolean },
): string => {
  const targetPhrase = artifactTargetPhrase(artifact) ?? `to ${scopePhrase(artifact.scope)}`;
  if (type === "instruction-file management") {
    return `${verb} ${type} ${targetPhrase}`;
  }
  const configuredPrefix = options?.configured === true ? "configured " : "";
  return `${verb} ${configuredPrefix}${type} ${cleanStepLabel(step.label)} ${targetPhrase}`;
};

const mcpAddServerName = (
  allSteps: ReadonlyArray<CompletedJobStep<unknown>>,
): string | undefined => {
  const configureStep = allSteps.find((step) => step.label.startsWith("Configure "));
  return configureStep?.label.slice("Configure ".length);
};

const renderMcpAddOutcome = (
  allSteps: ReadonlyArray<CompletedJobStep<unknown>>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  verbosity: { readonly quiet: boolean; readonly verbose: boolean },
) =>
  Effect.gen(function* () {
    const messages = successMessages(allSteps);
    const artifacts = allSteps.flatMap((step) =>
      step.result.result === "success" && step.result.artifact !== undefined
        ? [{ step, artifact: step.result.artifact }]
        : [],
    );
    const serverName = mcpAddServerName(allSteps);
    const suggestions =
      serverName === undefined
        ? [{ description: "Inspect MCP servers", cmd: "axm mcps list" }]
        : [
            { description: "Inspect MCP servers", cmd: "axm mcps list" },
            { description: "Undo", cmd: `axm mcps uninstall ${serverName}` },
          ];
    const summary =
      artifacts.length === 0
        ? undefined
        : artifacts.map(({ step, artifact }) => formatArtifactRow(step, artifact)).join("\n");
    const detailSummary = joinSummary(summary, successWarnings(allSteps).join("\n"));

    yield* renderer.success(
      messages.length === 0 ? "Configured MCP server" : messages.join("; "),
      verbosity.quiet
        ? undefined
        : {
            ...(detailSummary === undefined ? {} : { summary: detailSummary }),
            suggestions,
          },
    );
  });

const renderExecutedOutcome = (
  plan: ExecutedPlan<unknown>,
  allSteps: ReadonlyArray<CompletedJobStep<unknown>>,
  renderer: ServiceMap.Service.Shape<typeof CliRenderer>,
  verbosity: { readonly quiet: boolean; readonly verbose: boolean },
) =>
  Effect.gen(function* () {
    const successes = allSteps.filter((step) => step.result.result === "success");
    const artifacts = successes.flatMap((step) =>
      step.result.result === "success" && step.result.artifact !== undefined
        ? [{ step, artifact: step.result.artifact }]
        : [],
    );
    const verb = operationVerb(plan.name);
    const type = artifactType(plan.name);
    const configured = plan.name.toLowerCase().includes("configured");

    if (successes.length === 0) {
      yield* renderer.success(`${verb} 0 ${artifactPluralType(type)}`);
      return;
    }

    if (plan.name === "Add MCP server") {
      yield* renderMcpAddOutcome(allSteps, renderer, verbosity);
      return;
    }

    if (artifacts.length === 1 && successes.length === 1) {
      const first = artifacts[0];
      if (first !== undefined) {
        if (first.artifact.change === "unchanged") {
          yield* renderer.success(unchangedHeadline(first.step, first.artifact));
          return;
        }

        const suggestions = singleArtifactSuggestions(type, first.step.label, first.artifact, verb);
        const summary =
          joinSummary(
            formatArtifactSummary(first.artifact, verbosity.verbose),
            ...successWarnings([first.step]),
          ) ?? formatArtifactSummary(first.artifact, verbosity.verbose);
        yield* renderer.success(
          singleArtifactHeadline(verb, type, first.step, first.artifact, { configured }),
          verbosity.quiet
            ? undefined
            : {
                summary,
                ...(suggestions === undefined ? {} : { suggestions }),
              },
        );
      }
      return;
    }

    const firstArtifact = artifacts[0]?.artifact;
    const allUnchanged =
      artifacts.length > 0 && artifacts.every(({ artifact }) => artifact.change === "unchanged");
    if (allUnchanged) {
      yield* renderer.success(
        `Already up to date — ${count(successes.length, type, artifactPluralType(type))}`,
        verbosity.quiet
          ? undefined
          : {
              summary:
                joinSummary(
                  artifacts
                    .map(({ step, artifact }) => formatArtifactRow(step, artifact))
                    .join("\n"),
                  successWarnings(allSteps).join("\n"),
                ) ?? "",
            },
      );
      return;
    }

    const target =
      firstArtifact === undefined
        ? ""
        : ` to ${scopePhrase(firstArtifact.scope)} (${firstArtifact.path})`;
    const configuredPrefix = configured ? "configured " : "";
    const headline = `${verb} ${configuredPrefix}${count(
      successes.length,
      type,
      artifactPluralType(type),
    )}${target}`;
    const summary =
      artifacts.length > 0
        ? artifacts.map(({ step, artifact }) => formatArtifactRow(step, artifact)).join("\n")
        : undefined;
    const detailSummary = joinSummary(summary, successWarnings(allSteps).join("\n"));
    const suggestions = inspectSuggestionsForType(type);
    yield* renderer.success(
      headline,
      verbosity.quiet
        ? undefined
        : {
            ...(detailSummary === undefined ? {} : { summary: detailSummary }),
            ...(suggestions === undefined ? {} : { suggestions }),
          },
    );
  });
