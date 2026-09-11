/**
 * Installing extensions.
 *
 * One use case behind seventeen command spellings. `axm install` with a
 * registry FQN, `axm <type> install <source>`, `axm install <locator>`, and
 * either form with no source at all are the same decision with different
 * amounts already known: which type, which source, which versions, and which
 * of a source's contents the person wants.
 *
 * `prepare` settles all of that and writes nothing. The locator form is the
 * reason it must: a locator can carry skills, rules, hooks, knowledge bundles
 * and subagents at once, and each is an independent closure inside one
 * prepared candidate — so the preview shows the whole set, one type failing
 * leaves the others committed, and the operation reports every outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ConfiguredAgentOperation,
  type ExecutionCandidate,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";

import type { ExtensionResolutionFailed } from "@agentxm/extension-resolution";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { withPublisherTrust } from "../publisher-binding.js";
import { planHookInstall } from "../hooks/install/plan.js";
import {
  discoverHookRefs,
  finalizeHookInstallIntent,
  parseHookInstallRequest,
} from "../hooks/install/plan.js";
import {
  discoverKnowledgeRefs,
  finalizeKnowledgeInstallIntent,
  parseKnowledgeInstallRequest,
  planKnowledgeInstall,
} from "../knowledge/install/plan.js";
import {
  discoverMcpServerRefs,
  finalizeMcpServerInstallIntent,
  parseMcpServerInstallRequest,
  planMcpServerInstall,
  resolveMcpServerSourceRequest,
} from "../mcps/install/plan.js";
import {
  discoverPackRef,
  finalizePackInstallIntent,
  packDiscoveryDiagnostics,
  parsePackInstallRequest,
  planPackInstall,
  resolvePackSourceRequest,
} from "../packs/install/plan.js";
import {
  discoverRuleRefs,
  finalizeRuleInstallIntent,
  parseRuleInstallRequest,
  planRuleInstall,
} from "../rules/install/plan.js";
import {
  discoverSkillRefs,
  finalizeSkillInstallIntent,
  parseSkillInstallRequest,
  planSkillInstall,
  buildCompanionPackagesSection,
} from "../skills/install/plan.js";
import {
  discoverSubagentRefs,
  finalizeSubagentInstallIntent,
  parseSubagentInstallRequest,
  planSubagentInstall,
} from "../subagents/install/plan.js";
import { BundledAxmSkillAsset, planBundledAxmSkillInstall } from "../skills/install/bundled.js";
import { buildConfiguredInstallPlan, type ConfiguredInstallRequirements } from "./configured.js";
import { formatRegistryProbe } from "./registry-source-resolution.js";
import { resolveRootInstallIntent } from "./root-intent.js";
import type { ExtensionSelectionCancelled } from "./selection-interaction.js";
import { ExtensionSelectionInteraction } from "./selection-interaction.js";
import {
  installRefused,
  type InstallExecutionFailure,
  type InstallStepRequirements,
  type PrepareInstallRequirements,
} from "./vocabulary.js";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/**
 * What the request installs: the extensions the workspace already declares,
 * one source a person named, or the official skill the executable carries.
 */
export type InstallSubject =
  | { readonly kind: "configured" }
  | { readonly kind: "source"; readonly source: string }
  | { readonly kind: "bundled" };

/** One install request, whatever command spelling produced it. */
export interface InstallExtensionsRequest {
  /**
   * The type the command fixed. `none` is the root form: a registry FQN names
   * its own type and a locator is opened to find out.
   */
  readonly type: Option.Option<InstallableExtensionType>;
  readonly subject: InstallSubject;
  /** Names or glob patterns the request named inside the source. */
  readonly names: ReadonlyArray<string>;
  /** Take everything the source offers without asking. */
  readonly all: boolean;
  /** Re-materialize even when the canonical tree already matches the lockfile. */
  readonly reinstall: boolean;
  /** The local connection name an MCP install writes under. */
  readonly localName: Option.Option<string>;
  /** `KEY=VALUE` inputs an MCP install supplies. */
  readonly env: ReadonlyArray<string>;
  /** No prompt can open in this invocation. */
  readonly nonInteractive: boolean;
  /** Human-readable name for the operation, chosen by the command. */
  readonly planName: string;
  readonly planDescription: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/**
 * Evidence the settling collected that the application may show but that no
 * decision depends on: which registries were consulted, and which packages
 * the selected extensions declare themselves compatible with.
 */
export interface InstallDiagnostics {
  readonly resolutionLines: ReadonlyArray<string>;
  readonly companionPackages: ReadonlyArray<string>;
}

/**
 * A settled install: every decision is made and nothing is written. `types`
 * says which extension types the prepared closures cover, so a root locator
 * install can report the five it detected.
 */
export interface InstallExtensionsCandidate {
  readonly types: ReadonlyArray<InstallableExtensionType>;
  /** Nothing matched the request; the application renders its own no-op. */
  readonly empty: boolean;
  /** Present only when nothing matched: what to tell the person. */
  readonly emptyMessage: Option.Option<string>;
  readonly diagnostics: InstallDiagnostics;
  readonly planName: string;
  readonly execution: ExecutionCandidate<InstallStepRequirements | BundledAxmSkillAsset>;
}

/**
 * Every failure settling an install can surface before anything is written.
 * A configured entry's resolution refusal travels with its own category and
 * sentence rather than as this feature's generic refusal.
 */
export type InstallExtensionsFailure =
  | ExtensionLifecycleFailed
  | ExtensionResolutionFailed
  | ExtensionSelectionCancelled
  | InstallExecutionFailure;

const EMPTY_DIAGNOSTICS: InstallDiagnostics = { resolutionLines: [], companionPackages: [] };

const emptyPlan = (request: InstallExtensionsRequest): Plan<InstallStepRequirements> => ({
  _tag: "Plan",
  name: request.planName,
  description: request.planDescription,
  presentation: operationPresentation(
    { imperative: "install", past: "Installed", gerund: "Installing" },
    Option.getOrUndefined(request.type),
  ),
  jobs: [{ concurrency: 1, steps: [] }],
});

interface PlannedInstall {
  readonly types: ReadonlyArray<InstallableExtensionType>;
  readonly plan: Plan<InstallStepRequirements | BundledAxmSkillAsset>;
  readonly diagnostics: InstallDiagnostics;
  readonly configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation>;
  readonly emptyMessage: Option.Option<string>;
}

const planForType = (
  type: InstallableExtensionType,
  source: string,
  request: InstallExtensionsRequest,
): Effect.Effect<
  { readonly plan: Plan<InstallStepRequirements>; readonly diagnostics: InstallDiagnostics },
  InstallExtensionsFailure,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
  | ExtensionSelectionInteraction
  | BundledAxmSkillAsset
> => {
  switch (type) {
    case "skill":
      return Effect.gen(function* () {
        const parsed = yield* parseSkillInstallRequest({
          source,
          skills: request.names,
          all: request.all,
          force: request.reinstall,
          nonInteractive: request.nonInteractive,
        }).pipe(
          Effect.mapError((cause) =>
            cause._tag === "ExtensionLifecycleFailed"
              ? cause
              : installRefused({
                  category: "validation",
                  detail: `Skill source "${source}" could not be resolved`,
                  cause,
                }),
          ),
        );
        const discovered = yield* discoverSkillRefs(parsed);
        const intent = yield* finalizeSkillInstallIntent(parsed, discovered);
        const plan = yield* planSkillInstall(intent);
        const companions = buildCompanionPackagesSection(
          intent.skillsToInstall.map((entry) => entry.ref),
        );
        return {
          plan,
          diagnostics: {
            resolutionLines: [
              ...(parsed.resolutionProbes.length > 0
                ? [`Resolution: ${parsed.resolutionProbes.map(formatRegistryProbe).join("; ")}`]
                : []),
              `Found ${discovered.length} skill${discovered.length === 1 ? "" : "s"}`,
            ],
            companionPackages: companions === undefined ? [] : companions.items,
          },
        };
      });
    case "subagent":
      return Effect.gen(function* () {
        const parsed = yield* parseSubagentInstallRequest({
          source,
          subagents: request.names,
          all: request.all,
          nonInteractive: request.nonInteractive,
        }).pipe(
          Effect.mapError((cause) =>
            cause._tag === "ExtensionLifecycleFailed"
              ? cause
              : installRefused({
                  category: "validation",
                  detail: `Subagent source "${source}" could not be resolved`,
                  cause,
                }),
          ),
        );
        const discovered = yield* discoverSubagentRefs(parsed);
        const intent = yield* finalizeSubagentInstallIntent(parsed, discovered);
        return {
          plan: yield* planSubagentInstall(intent),
          diagnostics: {
            resolutionLines: [
              ...(parsed.resolutionProbes.length > 0
                ? [`Resolution: ${parsed.resolutionProbes.map(formatRegistryProbe).join("; ")}`]
                : []),
              `Found ${discovered.length} subagent${discovered.length === 1 ? "" : "s"}`,
            ],
            companionPackages: [],
          },
        };
      });
    case "rule":
      return Effect.gen(function* () {
        const parsed = yield* parseRuleInstallRequest(source);
        const intent = yield* finalizeRuleInstallIntent(parsed, yield* discoverRuleRefs(parsed));
        return { plan: yield* planRuleInstall(intent), diagnostics: EMPTY_DIAGNOSTICS };
      });
    case "hook":
      return Effect.gen(function* () {
        const parsed = yield* parseHookInstallRequest(source);
        const intent = yield* finalizeHookInstallIntent(parsed, yield* discoverHookRefs(parsed));
        return { plan: yield* planHookInstall(intent), diagnostics: EMPTY_DIAGNOSTICS };
      });
    case "knowledge":
      return Effect.gen(function* () {
        const parsed = yield* parseKnowledgeInstallRequest(source);
        const intent = yield* finalizeKnowledgeInstallIntent(
          parsed,
          yield* discoverKnowledgeRefs(parsed),
        );
        return { plan: yield* planKnowledgeInstall(intent), diagnostics: EMPTY_DIAGNOSTICS };
      });
    case "mcp-server":
      return Effect.gen(function* () {
        const parsed = yield* parseMcpServerInstallRequest({
          source,
          localName: request.localName,
          env: request.env,
          force: request.reinstall,
          nonInteractive: request.nonInteractive,
        });
        const sourceRequest = yield* resolveMcpServerSourceRequest(parsed);
        const intent = yield* finalizeMcpServerInstallIntent(
          parsed,
          yield* discoverMcpServerRefs(sourceRequest),
        );
        return { plan: yield* planMcpServerInstall(intent), diagnostics: EMPTY_DIAGNOSTICS };
      });
    case "pack":
      return Effect.gen(function* () {
        const parsed = yield* parsePackInstallRequest({
          source,
          nonInteractive: request.nonInteractive,
        });
        const sourceRequest = yield* resolvePackSourceRequest(parsed);
        const discovery = yield* discoverPackRef(sourceRequest);
        const intent = finalizePackInstallIntent(parsed, discovery);
        return {
          plan: yield* planPackInstall(intent),
          diagnostics: {
            resolutionLines: packDiscoveryDiagnostics(sourceRequest, discovery),
            companionPackages: [],
          },
        };
      });
  }
};

/** The types a locator can carry, in the order a locator install reports them. */
const LOCATOR_TYPES = ["skill", "rule", "hook", "knowledge", "subagent"] as const;

const isNoMatch = (failure: InstallExtensionsFailure): boolean =>
  failure._tag === "ExtensionLifecycleFailed" &&
  (failure.category === "not_found" || failure.category === "usage");

/**
 * A locator names a place, not a type. Each installable type is offered the
 * source and the ones that find nothing there simply do not contribute; if no
 * type matches, the locator held nothing AXM can install.
 */
const planLocatorInstall = (
  source: string,
  request: InstallExtensionsRequest,
): Effect.Effect<
  PlannedInstall,
  InstallExtensionsFailure,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
  | ExtensionSelectionInteraction
  | BundledAxmSkillAsset
> =>
  Effect.gen(function* () {
    const attempts = yield* Effect.forEach(
      LOCATOR_TYPES,
      (type) =>
        planForType(type, source, request).pipe(
          Effect.map((planned) => Option.some({ type, ...planned })),
          Effect.catch((failure) =>
            isNoMatch(failure)
              ? Effect.succeed(
                  Option.none<{
                    readonly type: InstallableExtensionType;
                    readonly plan: Plan<InstallStepRequirements>;
                    readonly diagnostics: InstallDiagnostics;
                  }>(),
                )
              : Effect.fail(failure),
          ),
        ),
      { concurrency: 1 },
    );
    const matched = attempts.flatMap((attempt) => (Option.isSome(attempt) ? [attempt.value] : []));

    if (matched.length === 0) {
      return yield* installRefused({
        category: "not_found",
        detail:
          "No locator-discoverable extensions found in source (supported: skills, rules, hooks, knowledge, and subagents)",
      });
    }

    // Every matched type is one independent closure inside a single
    // candidate: the preview shows all of them, and each settles on its own.
    const steps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> = matched.flatMap(
      ({ plan }) => plan.jobs.flatMap((job) => job.steps),
    );
    return {
      types: matched.map(({ type }) => type),
      plan: {
        _tag: "Plan",
        name: request.planName,
        description: request.planDescription,
        presentation: operationPresentation({
          imperative: "install",
          past: "Installed",
          gerund: "Installing",
        }),
        jobs: [{ concurrency: 1, steps, executionPolicy: "best-effort" }],
      },
      diagnostics: {
        resolutionLines: matched.flatMap(({ diagnostics }) => diagnostics.resolutionLines),
        companionPackages: [
          ...new Set(matched.flatMap(({ diagnostics }) => diagnostics.companionPackages)),
        ],
      },
      configuredAgentOperations: [],
      emptyMessage: Option.none(),
    } satisfies PlannedInstall;
  });

const planRequest = (
  request: InstallExtensionsRequest,
): Effect.Effect<
  PlannedInstall,
  InstallExtensionsFailure,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
  | ExtensionSelectionInteraction
  | BundledAxmSkillAsset
> =>
  Effect.gen(function* () {
    if (request.subject.kind === "bundled") {
      return {
        types: ["skill" as const],
        plan: yield* planBundledAxmSkillInstall,
        diagnostics: EMPTY_DIAGNOSTICS,
        configuredAgentOperations: [],
        emptyMessage: Option.none(),
      } satisfies PlannedInstall;
    }

    if (request.subject.kind === "configured") {
      const result = yield* buildConfiguredInstallPlan({
        type: request.type,
        planName: request.planName,
        planDescription: request.planDescription,
        nonInteractive: request.nonInteractive,
      });
      if (result._tag === "NoConfiguredExtensions") {
        return {
          types: Option.toArray(request.type),
          plan: emptyPlan(request),
          diagnostics: EMPTY_DIAGNOSTICS,
          configuredAgentOperations: [],
          emptyMessage: Option.some(result.message),
        } satisfies PlannedInstall;
      }
      return {
        types: Option.toArray(request.type),
        plan: result.plan,
        diagnostics: EMPTY_DIAGNOSTICS,
        configuredAgentOperations: result.configuredAgentOperations,
        emptyMessage: Option.none(),
      } satisfies PlannedInstall;
    }

    const source = request.subject.source;
    const type = yield* Option.match(request.type, {
      onSome: (value) => Effect.succeed<InstallableExtensionType | "locator">(value),
      onNone: () => resolveRootInstallIntent(source).pipe(Effect.map((intent) => intent.type)),
    });

    if (type === "locator") return yield* planLocatorInstall(source, request);

    const { plan, diagnostics } = yield* planForType(type, source, request);
    return {
      types: [type],
      plan: { ...plan, name: plan.name },
      diagnostics,
      configuredAgentOperations: [],
      emptyMessage: Option.none(),
    } satisfies PlannedInstall;
  });

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle an install without writing anything. */
export const prepareInstallExtensions: (
  request: InstallExtensionsRequest,
) => Effect.Effect<
  InstallExtensionsCandidate,
  InstallExtensionsFailure,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
  | ExtensionSelectionInteraction
  | BundledAxmSkillAsset
> = Effect.fn("InstallExtensions.prepare")(function* (request: InstallExtensionsRequest) {
  const planned = yield* planRequest(request);
  // Every acceptance a plan proposes is classified against the accepted
  // resolution here, so the root, per-type, locator, and configured routes
  // share one publisher-trust rule instead of restating it five times.
  const trusted = yield* withPublisherTrust(planned.plan);
  const execution = yield* prepareExecutionCandidate(trusted, {
    configuredAgentOperations: planned.configuredAgentOperations,
  });
  return {
    types: planned.types,
    empty: Option.isSome(planned.emptyMessage),
    emptyMessage: planned.emptyMessage,
    diagnostics: planned.diagnostics,
    planName: trusted.name,
    execution,
  } satisfies InstallExtensionsCandidate;
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/**
 * Everything resolving a settled install writes through: the candidate's own
 * step requirements plus the operation boundary that presents, journals, and
 * applies it.
 */
export type ResolveInstallExtensionsRequirements =
  PrepareInstallRequirements | BundledAxmSkillAsset;

/** Preview or apply a settled install, resolving to one operation outcome. */
export const previewOrApplyInstallExtensions = (
  candidate: InstallExtensionsCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution,
  InstallExtensionsFailure,
  ResolveInstallExtensionsRequirements
> => resolveExecutionCandidate(candidate.execution, execution);

/** The install use case: settle a request, then preview or apply it. */
export const InstallExtensions = {
  prepare: prepareInstallExtensions,
  previewOrApply: previewOrApplyInstallExtensions,
} as const;
