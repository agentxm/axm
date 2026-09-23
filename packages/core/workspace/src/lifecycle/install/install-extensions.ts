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
 * reason it must: a locator can carry several extension types at once, and
 * each is an independent closure inside one prepared candidate — so the
 * preview shows the whole set, one type failing leaves the others committed,
 * and the operation reports every outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as Option from "effect/Option";

import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
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
} from "../../transitions/planning/index.js";

import type { ExtensionResolutionFailed } from "../../resolution/index.js";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { withPublisherTrust } from "../publisher-binding.js";
import { withSourceSwitches } from "../source-switch.js";
import { planHookInstall } from "../../hooks/lifecycle/install/plan.js";
import {
  discoverHookRefs,
  finalizeHookInstallIntent,
  parseHookInstallRequest,
} from "../../hooks/lifecycle/install/plan.js";
import {
  discoverKnowledgeRefs,
  finalizeKnowledgeInstallIntent,
  parseKnowledgeInstallRequest,
  planKnowledgeInstall,
} from "../../knowledge/lifecycle/install/plan.js";
import {
  discoverMcpServerRefs,
  finalizeMcpServerInstallIntent,
  parseMcpServerInstallRequest,
  planMcpServerInstall,
  resolveMcpServerSourceRequest,
} from "../../mcp-connections/lifecycle/install/plan.js";
import {
  discoverPackRefs,
  finalizePackInstallIntent,
  packDiscoveryDiagnostics,
  parsePackInstallRequest,
  planPackInstall,
  resolvePackSourceRequest,
} from "../../packs/lifecycle/install/plan.js";
import {
  discoverRuleRefs,
  finalizeRuleInstallIntent,
  parseRuleInstallRequest,
  planRuleInstall,
} from "../../instructions/lifecycle/install/plan.js";
import {
  discoverSkillRefs,
  finalizeSkillInstallIntent,
  parseSkillInstallRequest,
  planSkillInstall,
  buildCompanionPackagesSection,
} from "../../skills/lifecycle/install/plan.js";
import {
  discoverSubagentRefs,
  finalizeSubagentInstallIntent,
  parseSubagentInstallRequest,
  planSubagentInstall,
} from "../../subagents/lifecycle/install/plan.js";
import {
  BundledAxmSkillAsset,
  planBundledAxmSkillInstall,
} from "../../skills/lifecycle/install/bundled.js";
import { buildConfiguredInstallPlan, type ConfiguredInstallRequirements } from "./configured.js";
import { formatRegistryProbe } from "./registry-source-resolution.js";
import { resolveRootInstallIntent } from "./root-intent.js";
import {
  SkillSelectionInteraction,
  type SkillSelectionFailure,
} from "../../skills/lifecycle/application/index.js";
import {
  SubagentSelectionInteraction,
  type SubagentSelectionFailure,
} from "../../subagents/lifecycle/application/index.js";
import {
  installRefused,
  type InstallExecutionFailure,
  type InstallStepRequirements,
  type PrepareInstallRequirements,
} from "./vocabulary.js";
import { findGitReinstallRefs, pinGitReinstallRef } from "./git-reinstall.js";
import { SourceHostProviders } from "../../resolution/sources/service.js";
import { makeLocatorSourceView } from "./git-discovery.js";
import {
  InstallSelectionInteraction,
  selectInstallRefs,
  type InstallSelectionFailure,
} from "./selection.js";

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

/** Selectors grouped by the type whose source contents they name. */
export type InstallExtensionSelectors = Partial<
  Readonly<Record<InstallableExtensionType, ReadonlyArray<string>>>
>;

/** Read one type's selectors without leaking optionality into planners. */
export const installSelectorsFor = (
  selectors: InstallExtensionSelectors,
  type: InstallableExtensionType,
): ReadonlyArray<string> => selectors[type] ?? [];

/** One install request, whatever command spelling produced it. */
export interface InstallExtensionsRequest {
  /**
   * The type the command fixed. `none` is the root form: a registry FQN names
   * its own type and a locator is opened to find out.
   */
  readonly type: Option.Option<InstallableExtensionType>;
  readonly subject: InstallSubject;
  /** Names or glob patterns, kept separate for each installable type. */
  readonly selectors: InstallExtensionSelectors;
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
  | Config.ConfigError
  | ExtensionLifecycleFailed
  | ExtensionResolutionFailed
  | SkillSelectionFailure
  | SubagentSelectionFailure
  | InstallSelectionFailure
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

const combineTypePlans = (
  type: InstallableExtensionType,
  plans: ReadonlyArray<Plan<InstallStepRequirements>>,
): Plan<InstallStepRequirements> => {
  const [only] = plans;
  if (plans.length === 1 && only !== undefined) return only;
  const riskConditions = plans.flatMap((plan) => plan.riskConditions ?? []);
  const failureSuggestions = plans.flatMap((plan) => plan.failureSuggestions ?? []);
  return {
    _tag: "Plan",
    name: only?.name ?? `Install ${type}`,
    description: only?.description ?? Option.none(),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      type,
    ),
    jobs: [
      {
        concurrency: 1,
        steps: plans.flatMap((plan) => plan.jobs.flatMap((job) => job.steps)),
      },
    ],
    ...(riskConditions.length === 0 ? {} : { riskConditions }),
    ...(failureSuggestions.length === 0 ? {} : { failureSuggestions }),
  };
};

const planForType = (
  type: InstallableExtensionType,
  source: string,
  request: InstallExtensionsRequest,
): Effect.Effect<
  { readonly plan: Plan<InstallStepRequirements>; readonly diagnostics: InstallDiagnostics },
  InstallExtensionsFailure,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
  | SkillSelectionInteraction
  | SubagentSelectionInteraction
  | InstallSelectionInteraction
  | BundledAxmSkillAsset
> => {
  const selectors = installSelectorsFor(request.selectors, type);
  switch (type) {
    case "skill":
      return Effect.gen(function* () {
        const parsed = yield* parseSkillInstallRequest({
          source,
          skills: selectors,
          all: request.all,
          force: request.reinstall,
          nonInteractive: request.nonInteractive,
        }).pipe(
          Effect.mapError((cause) =>
            cause._tag === "ExtensionLifecycleFailed" || cause._tag === "ConfigError"
              ? cause
              : installRefused({
                  category: "validation",
                  detail: `Skill source "${source}" could not be resolved`,
                  cause,
                }),
          ),
        );
        const accepted =
          request.reinstall && parsed.source.type === "git"
            ? yield* findGitReinstallRefs(parsed.source, "skill", parsed.requestedSkills)
            : [];
        const acceptedSkills = accepted.filter((ref) => ref.type === "skill");
        const discovered =
          acceptedSkills.length > 0 ? acceptedSkills : yield* discoverSkillRefs(parsed);
        const intent = yield* finalizeSkillInstallIntent(parsed, discovered);
        const settledIntent =
          request.reinstall && acceptedSkills.length === 0
            ? {
                ...intent,
                skillsToInstall: yield* Effect.forEach(intent.skillsToInstall, (entry) =>
                  pinGitReinstallRef(entry.ref).pipe(
                    Effect.flatMap((ref) =>
                      ref.type === "skill"
                        ? Effect.succeed({ ...entry, ref })
                        : Effect.fail(
                            installRefused({
                              category: "internal",
                              detail: "Accepted Git skill resolution changed extension type",
                            }),
                          ),
                    ),
                  ),
                ),
              }
            : intent;
        const plan = yield* planSkillInstall(settledIntent);
        const companions = buildCompanionPackagesSection(
          settledIntent.skillsToInstall.map((entry) => entry.ref),
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
          subagents: selectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        }).pipe(
          Effect.mapError((cause) =>
            cause._tag === "ExtensionLifecycleFailed" || cause._tag === "ConfigError"
              ? cause
              : installRefused({
                  category: "validation",
                  detail: `Subagent source "${source}" could not be resolved`,
                  cause,
                }),
          ),
        );
        const accepted =
          request.reinstall && parsed.source.type === "git"
            ? yield* findGitReinstallRefs(parsed.source, "subagent", parsed.requestedSubagents)
            : [];
        const acceptedSubagents = accepted.filter((ref) => ref.type === "subagent");
        const discovered =
          acceptedSubagents.length > 0 ? acceptedSubagents : yield* discoverSubagentRefs(parsed);
        const intent = yield* finalizeSubagentInstallIntent(parsed, discovered);
        const settledIntent =
          request.reinstall && acceptedSubagents.length === 0
            ? {
                ...intent,
                subagentsToInstall: yield* Effect.forEach(intent.subagentsToInstall, (entry) =>
                  pinGitReinstallRef(entry.ref).pipe(
                    Effect.flatMap((ref) =>
                      ref.type === "subagent"
                        ? Effect.succeed({ ...entry, ref })
                        : Effect.fail(
                            installRefused({
                              category: "internal",
                              detail: "Accepted Git subagent resolution changed extension type",
                            }),
                          ),
                    ),
                  ),
                ),
              }
            : intent;
        return {
          plan: yield* planSubagentInstall(settledIntent),
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
        const parsedSource = yield* parseRuleInstallRequest(source);
        const effectiveSelectors = selectors.length > 0 ? selectors : parsedSource.names;
        const parsed = {
          ...parsedSource,
          names: selectors.length > 0 ? selectors : parsedSource.names,
        };
        const accepted =
          request.reinstall && parsed.source.type === "git"
            ? yield* findGitReinstallRefs(parsed.source, "rule", parsed.names)
            : [];
        const acceptedRules = accepted.filter((ref) => ref.type === "rule");
        const discovered =
          acceptedRules.length > 0 ? acceptedRules : yield* discoverRuleRefs(parsed);
        const selected = yield* selectInstallRefs(discovered, {
          type,
          selectors: effectiveSelectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        });
        const intent = yield* finalizeRuleInstallIntent(parsed, selected);
        const refs =
          request.reinstall && acceptedRules.length === 0
            ? yield* Effect.forEach(intent.refs, (entry) =>
                pinGitReinstallRef(entry.ref).pipe(
                  Effect.flatMap((ref) =>
                    ref.type === "rule"
                      ? Effect.succeed({ ...entry, ref })
                      : Effect.fail(
                          installRefused({
                            category: "internal",
                            detail: "Accepted Git rule resolution changed extension type",
                          }),
                        ),
                  ),
                ),
              )
            : intent.refs;
        return {
          plan: yield* planRuleInstall({ ...intent, refs }),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "hook":
      return Effect.gen(function* () {
        const parsedSource = yield* parseHookInstallRequest(source);
        const effectiveSelectors = selectors.length > 0 ? selectors : parsedSource.names;
        const parsed = {
          ...parsedSource,
          names: selectors.length > 0 ? selectors : parsedSource.names,
        };
        const accepted =
          request.reinstall && parsed.source.type === "git"
            ? yield* findGitReinstallRefs(parsed.source, "hook", parsed.names)
            : [];
        const acceptedHooks = accepted.filter((ref) => ref.type === "hook");
        const discovered =
          acceptedHooks.length > 0 ? acceptedHooks : yield* discoverHookRefs(parsed);
        const selected = yield* selectInstallRefs(discovered, {
          type,
          selectors: effectiveSelectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        });
        const intent = yield* finalizeHookInstallIntent(parsed, selected);
        const refs =
          request.reinstall && acceptedHooks.length === 0
            ? yield* Effect.forEach(intent.refs, (entry) =>
                pinGitReinstallRef(entry.ref).pipe(
                  Effect.flatMap((ref) =>
                    ref.type === "hook"
                      ? Effect.succeed({ ...entry, ref })
                      : Effect.fail(
                          installRefused({
                            category: "internal",
                            detail: "Accepted Git hook resolution changed extension type",
                          }),
                        ),
                  ),
                ),
              )
            : intent.refs;
        return {
          plan: yield* planHookInstall({ ...intent, refs }),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "knowledge":
      return Effect.gen(function* () {
        const parsedSource = yield* parseKnowledgeInstallRequest(source);
        const effectiveSelectors = selectors.length > 0 ? selectors : parsedSource.names;
        const parsed = {
          ...parsedSource,
          names: selectors.length > 0 ? selectors : parsedSource.names,
        };
        const accepted =
          request.reinstall && parsed.source.type === "git"
            ? yield* findGitReinstallRefs(parsed.source, "knowledge", parsed.names)
            : [];
        const acceptedKnowledge = accepted.filter((ref) => ref.type === "knowledge");
        const discovered =
          acceptedKnowledge.length > 0 ? acceptedKnowledge : yield* discoverKnowledgeRefs(parsed);
        const selected = yield* selectInstallRefs(discovered, {
          type,
          selectors: effectiveSelectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        });
        const intent = yield* finalizeKnowledgeInstallIntent(parsed, selected);
        const refs =
          request.reinstall && acceptedKnowledge.length === 0
            ? yield* Effect.forEach(intent.refs, (entry) =>
                pinGitReinstallRef(entry.ref).pipe(
                  Effect.flatMap((ref) =>
                    ref.type === "knowledge"
                      ? Effect.succeed({ ...entry, ref })
                      : Effect.fail(
                          installRefused({
                            category: "internal",
                            detail: "Accepted Git Knowledge resolution changed extension type",
                          }),
                        ),
                  ),
                ),
              )
            : intent.refs;
        return {
          plan: yield* planKnowledgeInstall({ ...intent, refs }),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
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
        const implicitSelectors = Option.toArray(parsed.serverName);
        const effectiveSelectors = selectors.length > 0 ? selectors : implicitSelectors;
        const selectedNames =
          effectiveSelectors.length > 0
            ? effectiveSelectors
            : Option.toArray(Option.orElse(parsed.localName, () => parsed.serverName));
        const accepted =
          request.reinstall && sourceRequest.source.type === "git"
            ? yield* findGitReinstallRefs(sourceRequest.source, "mcp-server", selectedNames)
            : [];
        const acceptedMcpServers = accepted.filter((ref) => ref.type === "mcp-server");
        const discovered =
          acceptedMcpServers.length > 0
            ? acceptedMcpServers
            : yield* discoverMcpServerRefs(sourceRequest);
        if (discovered.length === 0) {
          yield* finalizeMcpServerInstallIntent(parsed, sourceRequest, discovered);
        }
        const selected = yield* selectInstallRefs(discovered, {
          type,
          selectors: effectiveSelectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        });
        if (Option.isSome(request.localName) && selected.length > 1) {
          return yield* installRefused({
            category: "usage",
            detail: "--as can only be used when installing one MCP server",
          });
        }
        const plans = yield* Effect.forEach(selected, (selectedRef) =>
          Effect.gen(function* () {
            const localName = Option.orElse(parsed.localName, () =>
              Option.some(selectedRef.server.name),
            );
            const selectedParsed = {
              ...parsed,
              serverName: Option.some(selectedRef.server.name),
              localName,
            };
            const selectedSourceRequest = {
              ...sourceRequest,
              serverName: Option.some(selectedRef.server.name),
            };
            const intent = yield* finalizeMcpServerInstallIntent(
              selectedParsed,
              selectedSourceRequest,
              [selectedRef],
            );
            const configuredName = Option.getOrElse(localName, () => intent.ref.server.name);
            const ref =
              request.reinstall && acceptedMcpServers.length === 0
                ? yield* pinGitReinstallRef(intent.ref, configuredName)
                : intent.ref;
            if (ref.type !== "mcp-server") {
              return yield* installRefused({
                category: "internal",
                detail: "Accepted Git MCP resolution changed extension type",
              });
            }
            return yield* planMcpServerInstall({ ...intent, ref });
          }),
        );
        return {
          plan: combineTypePlans(type, plans),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "pack":
      return Effect.gen(function* () {
        const parsed = yield* parsePackInstallRequest({
          source,
          nonInteractive: request.nonInteractive,
        });
        const sourceRequest = yield* resolvePackSourceRequest(parsed);
        const accepted =
          request.reinstall && sourceRequest.source.type === "git"
            ? yield* findGitReinstallRefs(
                sourceRequest.source,
                "pack",
                Option.toArray(sourceRequest.packName),
              )
            : [];
        const acceptedPacks = accepted.filter((ref) => ref.type === "pack");
        const implicitSelectors = Option.toArray(sourceRequest.packName);
        const effectiveSelectors = selectors.length > 0 ? selectors : implicitSelectors;
        const discovered =
          acceptedPacks.length > 0 ? acceptedPacks : yield* discoverPackRefs(sourceRequest);
        if (discovered.length === 0) {
          return yield* installRefused({
            category: "not_found",
            detail: "No pack was found in the source",
          });
        }
        const selected = yield* selectInstallRefs(discovered, {
          type,
          selectors: effectiveSelectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        });
        const plans = yield* Effect.forEach(selected, (selectedRef) =>
          Effect.gen(function* () {
            const discovery = { ref: selectedRef, probes: [], sourceLabel: source };
            const intent = finalizePackInstallIntent(parsed, discovery);
            const ref =
              request.reinstall && acceptedPacks.length === 0
                ? yield* pinGitReinstallRef(intent.packToInstall)
                : intent.packToInstall;
            if (ref.type !== "pack") {
              return yield* installRefused({
                category: "internal",
                detail: "Accepted Git Pack resolution changed extension type",
              });
            }
            return yield* planPackInstall({
              ...intent,
              packToInstall: ref,
              ...(request.reinstall ? { forceCanonical: true } : {}),
            });
          }),
        );
        return {
          plan: combineTypePlans(type, plans),
          diagnostics: {
            resolutionLines: selected.flatMap((ref) =>
              packDiscoveryDiagnostics(sourceRequest, { ref, probes: [], sourceLabel: source }),
            ),
            companionPackages: [],
          },
        };
      });
  }
};

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
  | SkillSelectionInteraction
  | SubagentSelectionInteraction
  | InstallSelectionInteraction
  | BundledAxmSkillAsset
> =>
  Effect.gen(function* () {
    const explicitlySelectedTypes = installableExtensionTypes.filter(
      (type) => installSelectorsFor(request.selectors, type).length > 0,
    );
    if (request.nonInteractive && !request.all && explicitlySelectedTypes.length === 0) {
      return yield* installRefused({
        category: "usage",
        detail: "A per-type selector or --all is required in non-interactive mode",
        recover:
          "Repeat --skill, --subagent, --rule, --hook, --knowledge, --mcp, or --pack for selected names, or pass --all",
      });
    }
    const candidateTypes =
      explicitlySelectedTypes.length > 0 ? explicitlySelectedTypes : installableExtensionTypes;
    const sources = yield* SourceHostProviders;
    const locatorSources = yield* makeLocatorSourceView(sources, candidateTypes.length);
    const attempts = yield* Effect.forEach(
      candidateTypes,
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
    ).pipe(Effect.provideService(SourceHostProviders, locatorSources));
    const matched = attempts.flatMap((attempt) => (Option.isSome(attempt) ? [attempt.value] : []));

    if (matched.length === 0) {
      return yield* installRefused({
        category: "not_found",
        detail: "No installable extensions were found in the source",
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
  | SkillSelectionInteraction
  | SubagentSelectionInteraction
  | InstallSelectionInteraction
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
        force: request.reinstall,
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

    const hasMcpOnlyInput = Option.isSome(request.localName) || request.env.length > 0;
    const locatorSelectsOnlyMcp =
      installSelectorsFor(request.selectors, "mcp-server").length > 0 &&
      installableExtensionTypes.every(
        (candidate) =>
          candidate === "mcp-server" ||
          installSelectorsFor(request.selectors, candidate).length === 0,
      );
    if (
      hasMcpOnlyInput &&
      type !== "mcp-server" &&
      !(type === "locator" && locatorSelectsOnlyMcp)
    ) {
      return yield* installRefused({
        category: "usage",
        detail: "--as and --env are only valid when installing MCP servers",
        recover: "Select MCP servers with --mcp, or use an @owner/mcps/name source",
      });
    }

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
  | SkillSelectionInteraction
  | SubagentSelectionInteraction
  | InstallSelectionInteraction
  | BundledAxmSkillAsset
> = Effect.fn("InstallExtensions.prepare")(function* (request: InstallExtensionsRequest) {
  const planned = yield* planRequest(request);
  // Every acceptance a plan proposes is classified against the accepted
  // resolution here, so the root, per-type, locator, and configured routes
  // share one publisher-trust rule instead of restating it five times.
  const trusted = yield* withPublisherTrust(planned.plan);
  const sourceAware = yield* withSourceSwitches(trusted);
  const execution = yield* prepareExecutionCandidate(sourceAware, {
    configuredAgentOperations: planned.configuredAgentOperations,
  });
  return {
    types: planned.types,
    empty: Option.isSome(planned.emptyMessage),
    emptyMessage: planned.emptyMessage,
    diagnostics: planned.diagnostics,
    planName: sourceAware.name,
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
