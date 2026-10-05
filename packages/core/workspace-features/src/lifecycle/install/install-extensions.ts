import { nativeUnitKey } from "@agentxm/workspace-kernel/locations";
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

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as Path from "effect/Path";
import * as Option from "effect/Option";

import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  operationPresentation,
  type ConfiguredAgentOperation,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
  type ExtensionLifecycleFailed,
  installRefused,
  InstallSelectionInteraction,
} from "@agentxm/workspace-kernel/operations";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";

import {
  makeConfiguredReleaseAgeEvaluation,
  acceptedPackDependencyResolver,
  type ExtensionResolutionFailed,
} from "@agentxm/workspace-kernel/resolution";

import { sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";
import { withPublisherTrust } from "../publisher-binding.js";
import { withSourceSwitches } from "../source-switch.js";
import {
  activeInstructionsConfig,
  instructionReadinessDetail,
  instructionReconciliationReadiness,
  observeInstructions,
} from "@agentxm/workspace-kernel/projection";
import {
  withWorkspaceReadView,
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  usableAcceptedCanonical,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";
import { planHookInstall } from "@agentxm/extension-kinds/hooks";
import { planKnowledgeInstall } from "@agentxm/extension-kinds/knowledge";
import {
  discoverMcpServerRefs,
  finalizeMcpServerInstallIntent,
  parseMcpServerInstallRequest,
  planMcpServerInstall,
  resolveMcpServerSourceRequest,
} from "@agentxm/extension-kinds/mcp-connections";
import {
  discoverPackRefs,
  finalizePackInstallIntent,
  packDiscoveryDiagnostics,
  parsePackInstallRequest,
  planPackInstall,
  resolvePackSourceRequest,
} from "@agentxm/extension-kinds/packs";
import { planRuleInstall } from "@agentxm/extension-kinds/instructions";
import {
  buildCompanionPackagesSection,
  BundledAxmSkillAsset,
  planBundledAxmSkillInstall,
  planSkillInstall,
} from "@agentxm/extension-kinds/skills";
import { planSubagentInstall } from "@agentxm/extension-kinds/subagents";
import { buildConfiguredInstallPlan, type ConfiguredInstallRequirements } from "./configured.js";
import { acceptedInstallRequestRefs } from "./accepted-request.js";
import {
  discoverInstallRefs,
  finalizeInstallRefs,
  parseLocatorInstallRequest,
  parseRegistryQualifiedInstallRequest,
  type ParsedInstallRequest,
  type SourceInstallRef,
  type SourceInstallType,
} from "./request.js";
import { resolveRootInstallIntent } from "./root-intent.js";
import type { InstallExecutionFailure, PrepareInstallRequirements } from "./vocabulary.js";
import {
  INSTALL_HELD_RELEASE_POLICY,
  toStepKey,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import { findSourceReinstallRefs, pinSourceReinstallRef } from "./accepted-source-reinstall.js";
import { SourceHostProviders, formatRegistryProbe } from "@agentxm/workspace-kernel/sources";
import { makeLocatorSourceView } from "./git-discovery.js";
import {
  selectInstallRefs,
  type InstallSelectionFailure,
  type InstallSelectionRequest,
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
  readonly bind: ReadonlyArray<string>;
  readonly bindEnv: ReadonlyArray<string>;
  readonly distributionId?: string;
  readonly nativeOauth?: boolean;
  readonly configuration?: import("@agentxm/extension-model/unstable/hooks/manifest-schema").HookConfigurationValues;
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
  readonly skillCandidates: ReadonlyArray<{
    readonly unitId: string;
    readonly memberId: string;
    readonly ref: SkillExtensionRef;
  }>;
  readonly installKind: "install" | "reinstall";
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

/**
 * A refusal the person's own selection caused inside one type's route. The
 * locator offers a source to every installable type and lets the types that
 * find nothing there drop out; a selector that matched nothing, or a missing
 * selector when no prompt can open, is not "nothing here" and must surface.
 * It travels under this tag until the route boundary unwraps it.
 */
class SelectionRefused extends Data.TaggedError("SelectionRefused")<{
  readonly failure: InstallSelectionFailure;
}> {}

const selectFrom = <Ref extends ExtensionRef>(
  refs: ReadonlyArray<Ref>,
  selection: InstallSelectionRequest,
): Effect.Effect<ReadonlyArray<Ref>, SelectionRefused, InstallSelectionInteraction> =>
  selectInstallRefs(refs, selection).pipe(
    Effect.mapError((failure) => new SelectionRefused({ failure })),
  );

const parseSourceInstallRequest = (
  type: SourceInstallType,
  source: string,
  names: ReadonlyArray<string>,
): Effect.Effect<
  ParsedInstallRequest,
  ExtensionLifecycleFailed | Config.ConfigError,
  ResolveInstallRequirements
> => {
  switch (type) {
    case "skill":
    case "subagent":
      return parseLocatorInstallRequest(type, { source, names });
    case "hook":
    case "rule":
    case "knowledge":
      return parseRegistryQualifiedInstallRequest(type, source);
  }
};

/** One source-backed selection and immutable source reinstall decision for five kinds. */
const settleSourceInstall = <T extends SourceInstallType>(
  type: T,
  source: string,
  selectors: ReadonlyArray<string>,
  request: InstallExtensionsRequest,
) =>
  Effect.gen(function* () {
    const parsedSource = yield* parseSourceInstallRequest(type, source, selectors);
    const names = selectors.length > 0 ? selectors : parsedSource.names;
    const parsed = { ...parsedSource, names };
    const isRequestedType = (ref: ExtensionRef): ref is SourceInstallRef<T> => ref.type === type;
    const repeated = yield* acceptedInstallRequestRefs({
      type,
      source: parsed.source,
      names,
      versionRange: parsed.versionRange,
      force: request.reinstall,
    });
    const accepted =
      repeated.length > 0
        ? repeated
        : request.reinstall && (parsed.source.type === "git" || parsed.source.type === "http")
          ? yield* findSourceReinstallRefs(parsed.source, type, names)
          : [];
    const acceptedRefs = accepted.filter(isRequestedType);
    const discovered =
      acceptedRefs.length > 0 ? acceptedRefs : yield* discoverInstallRefs(type, parsed);
    const selected = yield* selectFrom(discovered, {
      type,
      selectors: names,
      all: request.all,
      nonInteractive: request.nonInteractive,
    });
    const entries = yield* Effect.sync(() => finalizeInstallRefs(parsed, selected)).pipe(
      Effect.withSpan("InstallExtensions.finalizeIntent", { attributes: { type } }),
    );
    const refs =
      request.reinstall && acceptedRefs.length === 0
        ? yield* Effect.forEach(entries, (entry) =>
            pinSourceReinstallRef(entry.ref).pipe(
              Effect.flatMap((pinned) =>
                isRequestedType(pinned)
                  ? Effect.succeed({ ...entry, ref: pinned })
                  : Effect.fail(
                      installRefused({
                        category: "internal",
                        detail: `Accepted source ${type === "knowledge" ? "Knowledge" : type} resolution changed extension type`,
                      }),
                    ),
              ),
            ),
          )
        : entries;
    return { refs, foundCount: discovered.length, resolutionProbes: parsed.resolutionProbes };
  });

const planForType = (
  type: InstallableExtensionType,
  source: string,
  request: InstallExtensionsRequest,
): Effect.Effect<
  { readonly plan: Plan<InstallStepRequirements>; readonly diagnostics: InstallDiagnostics },
  InstallExtensionsFailure | SelectionRefused,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
  | InstallSelectionInteraction
  | BundledAxmSkillAsset
> => {
  const selectors = installSelectorsFor(request.selectors, type);
  switch (type) {
    case "skill":
      return Effect.gen(function* () {
        const settled = yield* settleSourceInstall("skill", source, selectors, request);
        const plan = yield* planSkillInstall({
          skillsToInstall: settled.refs,
          force: request.reinstall,
        });
        const companions = buildCompanionPackagesSection(settled.refs.map(({ ref }) => ref));
        return {
          plan,
          diagnostics: {
            resolutionLines: [
              ...(settled.resolutionProbes.length > 0
                ? [`Resolution: ${settled.resolutionProbes.map(formatRegistryProbe).join("; ")}`]
                : []),
              `Found ${settled.foundCount} skill${settled.foundCount === 1 ? "" : "s"}`,
            ],
            companionPackages: companions === undefined ? [] : companions.items,
          },
        };
      });
    case "subagent":
      return Effect.gen(function* () {
        const settled = yield* settleSourceInstall("subagent", source, selectors, request);
        return {
          plan: yield* planSubagentInstall({ subagentsToInstall: settled.refs }),
          diagnostics: {
            resolutionLines: [
              ...(settled.resolutionProbes.length > 0
                ? [`Resolution: ${settled.resolutionProbes.map(formatRegistryProbe).join("; ")}`]
                : []),
              `Found ${settled.foundCount} subagent${settled.foundCount === 1 ? "" : "s"}`,
            ],
            companionPackages: [],
          },
        };
      });
    case "rule":
      return Effect.gen(function* () {
        const settled = yield* settleSourceInstall("rule", source, selectors, request);
        return {
          plan: yield* planRuleInstall({ refs: settled.refs }),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "hook":
      return Effect.gen(function* () {
        const settled = yield* settleSourceInstall("hook", source, selectors, request);
        return {
          plan: yield* planHookInstall({
            refs: settled.refs,
            ...(request.configuration === undefined
              ? {}
              : { configuration: request.configuration }),
          }),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "knowledge":
      return Effect.gen(function* () {
        const settled = yield* settleSourceInstall("knowledge", source, selectors, request);
        return {
          plan: yield* planKnowledgeInstall({ refs: settled.refs }),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "mcp-server":
      return Effect.gen(function* () {
        const parsed = yield* parseMcpServerInstallRequest({
          source,
          localName: request.localName,
          bind: request.bind,
          bindEnv: request.bindEnv,
          ...(request.distributionId === undefined
            ? {}
            : { distributionId: request.distributionId }),
          ...(request.nativeOauth === undefined ? {} : { nativeOauth: request.nativeOauth }),
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
        const repeated = yield* acceptedInstallRequestRefs({
          type,
          source: sourceRequest.source,
          names: selectedNames,
          versionRange: parsed.versionRange,
          force: request.reinstall,
          ...(Option.isSome(parsed.localName) ? { localName: parsed.localName.value } : {}),
        });
        const accepted =
          repeated.length > 0
            ? repeated
            : request.reinstall && sourceRequest.source.type === "git"
              ? yield* findSourceReinstallRefs(sourceRequest.source, "mcp-server", selectedNames)
              : [];
        const acceptedMcpServers = accepted.filter((ref) => ref.type === "mcp-server");
        const discovered =
          acceptedMcpServers.length > 0
            ? acceptedMcpServers
            : yield* discoverMcpServerRefs(sourceRequest);
        if (discovered.length === 0) {
          yield* finalizeMcpServerInstallIntent(parsed, sourceRequest, discovered);
        }
        const selected = yield* selectFrom(discovered, {
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
                ? yield* pinSourceReinstallRef(intent.ref, configuredName)
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
        const repeated = yield* acceptedInstallRequestRefs({
          type,
          source: sourceRequest.source,
          names: selectors.length > 0 ? selectors : Option.toArray(sourceRequest.packName),
          versionRange: parsed.versionRange,
          force: request.reinstall,
        });
        const accepted =
          repeated.length > 0
            ? repeated
            : request.reinstall && sourceRequest.source.type === "git"
              ? yield* findSourceReinstallRefs(
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
        const selected = yield* selectFrom(discovered, {
          type,
          selectors: effectiveSelectors,
          all: request.all,
          nonInteractive: request.nonInteractive,
        });
        // The named Pack is the requested release; its members are selected
        // without an explicit version, so the minimum release age decides them.
        const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();
        const plans = yield* Effect.forEach(selected, (selectedRef) =>
          Effect.gen(function* () {
            const discovery = { ref: selectedRef, probes: [], sourceLabel: source };
            const intent = finalizePackInstallIntent(parsed, discovery, {
              releaseAgeEvaluation,
              heldRelease: INSTALL_HELD_RELEASE_POLICY,
            });
            const ref =
              request.reinstall && acceptedPacks.length === 0
                ? yield* pinSourceReinstallRef(intent.packToInstall)
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
              ...(acceptedPacks.length > 0
                ? { dependencyResolver: acceptedPackDependencyResolver() }
                : {}),
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
 * type matches, the locator held nothing AXM can install. A refusal the
 * selection itself raised is never "nothing here": it surfaces as is.
 */
const planLocatorInstall = (
  source: string,
  request: InstallExtensionsRequest,
): Effect.Effect<
  PlannedInstall,
  InstallExtensionsFailure,
  | PrepareInstallRequirements
  | ConfiguredInstallRequirements
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
        detail: "A per-type selector or --all is required when no prompt can open",
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
            failure._tag === "SelectionRefused"
              ? Effect.fail(failure.failure)
              : isNoMatch(failure)
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

    const hasMcpOnlyInput =
      Option.isSome(request.localName) ||
      request.bind.length > 0 ||
      request.bindEnv.length > 0 ||
      request.distributionId !== undefined ||
      request.nativeOauth === true;
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

    const { plan, diagnostics } = yield* planForType(type, source, request).pipe(
      Effect.catchTag("SelectionRefused", (refused) => Effect.fail(refused.failure)),
    );
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
  | InstallSelectionInteraction
  | BundledAxmSkillAsset
> = Effect.fn("InstallExtensions.prepare")(function* (request: InstallExtensionsRequest) {
  const planned = yield* planRequest(request);
  // Every acceptance a plan proposes is classified against the accepted
  // resolution here, so the root, per-type, locator, and configured routes
  // share one publisher-trust rule instead of restating it five times.
  const plan = {
    ...planned.plan,
    jobs: yield* Effect.forEach(planned.plan.jobs, (job) =>
      Effect.gen(function* () {
        const steps = yield* Effect.forEach(job.steps, (step) =>
          Effect.gen(function* () {
            if (step.readiness === "error") return step;
            const refs =
              step.acquisitionRefs ??
              (step.sourceBinding === undefined
                ? []
                : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])]);
            const boundRefs =
              step.sourceBinding === undefined
                ? refs
                : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])];
            const canonicalPaths = yield* Effect.forEach(boundRefs, (ref) =>
              acceptedLockedCanonicalPath({
                type: ref.type,
                name: ref.type === "mcp-server" ? ref.server.name : ref.name,
              }).pipe(
                Effect.map(Option.toArray),
                Effect.mapError((cause) =>
                  installRefused({
                    category: "internal",
                    detail: `Accepted path for ${ref.name} could not be read`,
                    cause,
                  }),
                ),
              ),
            );
            const acquisitionRefs = yield* Effect.filter(refs, (ref) =>
              Effect.gen(function* () {
                if (ref.refType === "workspace") return false;
                if (request.reinstall) return true;
                const canonical = yield* usableAcceptedCanonical({
                  type: ref.type,
                  name: ref.type === "mcp-server" ? ref.server.name : ref.name,
                }).pipe(
                  Effect.mapError((cause) =>
                    installRefused({
                      category: "internal",
                      detail: `Accepted content for ${ref.name} could not be inspected`,
                      cause,
                    }),
                  ),
                );
                if (Option.isNone(canonical)) return true;
                const accepted = yield* acceptedLockedResolutionRef({
                  type: ref.type,
                  name: ref.type === "mcp-server" ? ref.server.name : ref.name,
                }).pipe(
                  Effect.mapError((cause) =>
                    installRefused({
                      category: "internal",
                      detail: `Accepted resolution for ${ref.name} could not be read`,
                      cause,
                    }),
                  ),
                );
                return (
                  Option.isNone(accepted) ||
                  sourceRefContentKey(accepted.value) !== sourceRefContentKey(ref)
                );
              }),
            );
            return {
              ...step,
              acquisitionRefs,
              materialPaths: [...(step.materialPaths ?? []), ...canonicalPaths.flat()],
            };
          }),
        );
        return { ...job, steps };
      }),
    ),
  };
  const trusted = yield* withPublisherTrust(plan);
  const sourceAware = yield* withSourceSwitches(trusted);
  const touchesInstructionSurface = (
    step: PlannedJobStep<InstallStepRequirements | BundledAxmSkillAsset>,
  ) => {
    const key = step.key ?? "";
    return [
      "rule:",
      "knowledge:",
      "pack:",
      "projection:aggregate-units",
      "projection:rule",
      "projection:knowledge",
    ].some((prefix) => key.startsWith(prefix));
  };
  const hasSharedWriter = sourceAware.jobs.some((job) => job.steps.some(touchesInstructionSurface));
  const config = hasSharedWriter ? yield* activeInstructionsConfig() : Option.none();
  const readiness = Option.isSome(config)
    ? yield* Effect.gen(function* () {
        const snapshot = yield* observeInstructions({ config: config.value });
        const location = yield* WorkspaceLocation;
        return yield* instructionReconciliationReadiness({
          snapshot,
          workspaceRoot: location.baseDir,
        });
      })
    : Option.none();
  const gated = Option.isSome(readiness)
    ? {
        ...sourceAware,
        jobs: sourceAware.jobs.map((job) => ({
          ...job,
          steps: job.steps.map((step) =>
            touchesInstructionSurface(step)
              ? {
                  ...(step.key === undefined ? {} : { key: step.key }),
                  label: step.label,
                  readiness: "error" as const,
                  errorMessage: instructionReadinessDetail(readiness.value),
                  ...(step.artifact === undefined ? {} : { artifact: step.artifact }),
                }
              : step,
          ),
        })),
      }
    : sourceAware;
  const skillCandidates =
    request.subject.kind === "bundled"
      ? []
      : (yield* Effect.forEach(
          gated.jobs.flatMap((job) => job.steps),
          (step) =>
            Effect.gen(function* () {
              const skills = (step.acquisitionRefs ?? []).filter(
                (ref): ref is SkillExtensionRef => ref.type === "skill",
              );
              return yield* Effect.filter(skills, (ref) =>
                Effect.gen(function* () {
                  if (request.reinstall) return true;
                  // Unknown prior acceptance is insufficient evidence of a new acquisition.
                  return yield* acceptedLockedResolutionRef({ type: "skill", name: ref.name }).pipe(
                    Effect.match({
                      onFailure: () => false,
                      onSuccess: (accepted) =>
                        Option.isNone(accepted) ||
                        sourceRefContentKey(accepted.value) !== sourceRefContentKey(ref),
                    }),
                  );
                }),
              ).pipe(
                Effect.map((refs) =>
                  refs.map((ref) => ({
                    unitId: step.key ?? step.label,
                    memberId: toStepKey({ type: "skill", name: ref.skill.name }),
                    ref,
                  })),
                ),
              );
            }),
        )).flat();
  const execution = yield* prepareExecutionCandidate(gated, {
    configuredAgentOperations: planned.configuredAgentOperations,
  });
  return {
    types: planned.types,
    empty: Option.isSome(planned.emptyMessage),
    emptyMessage: planned.emptyMessage,
    diagnostics: planned.diagnostics,
    planName: sourceAware.name,
    execution,
    skillCandidates,
    installKind: request.reinstall ? "reinstall" : "install",
  } satisfies InstallExtensionsCandidate;
}, withWorkspaceReadView);

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

/** Neutral facts from fresh installation work and verified native output. */
export interface InstalledSkill {
  readonly ref: SkillExtensionRef;
  readonly scope: "project" | "user";
  readonly installKind: "install" | "reinstall";
  readonly targetAgents: ReadonlyArray<string>;
}

export interface InstallExtensionsResult {
  readonly resolution: OperationResolution;
  readonly installedSkills: ReadonlyArray<InstalledSkill>;
}

/** Preview or apply a settled install, resolving to one operation outcome. */
export const previewOrApplyInstallExtensions = (
  candidate: InstallExtensionsCandidate,
  execution: PlanExecution,
): Effect.Effect<
  InstallExtensionsResult,
  InstallExtensionsFailure,
  ResolveInstallExtensionsRequirements
> =>
  Effect.gen(function* () {
    const resolution = yield* resolveExecutionCandidate(candidate.execution, execution);
    const installedSkills: InstalledSkill[] = [];
    const path = yield* Path.Path;
    const workspace = yield* WorkspaceLocation;
    if (resolution.mode === "apply" && resolution.interruption === undefined) {
      const seen = new Map<string, number>();
      for (const entry of candidate.skillCandidates) {
        const unit = resolution.units.find(
          (unit) => unit.id === entry.unitId && unit.state === "committed",
        );
        if (unit?.artifact === undefined) continue;
        const member = unit.artifact.members?.find((member) => member.id === entry.memberId);
        const artifact =
          entry.unitId === entry.memberId
            ? unit.artifact
            : member?.changed === true
              ? member.artifact
              : undefined;
        if (artifact === undefined || artifact.change === "unchanged") continue;
        const finalLocations = (artifact.nativeLocations ?? []).map(
          (location) =>
            unit.artifact?.nativeLocations?.find(
              (final) => nativeUnitKey(final) === nativeUnitKey(location),
            ) ?? location,
        );
        const usable = finalLocations.filter(
          (location) =>
            location.ownership === "owned" &&
            ["created", "updated", "unchanged", "retained"].includes(location.state),
        );
        if (usable.length === 0) continue;
        const key = sourceRefContentKey(entry.ref);
        // A planned agent counts only when its exact native target is now usable.
        // Catalog potential readers do not prove an installation target.
        const targetAgents = (artifact.targets ?? []).flatMap((target) => {
          const targetPath = path.resolve(workspace.baseDir, target.path);
          return usable.some(
            (location) =>
              location.address.path === targetPath || location.aliases.includes(targetPath),
          )
            ? (target.agentIds ?? [])
            : [];
        });
        const previousIndex = seen.get(key);
        const previous = previousIndex === undefined ? undefined : installedSkills[previousIndex];
        if (previous !== undefined && previousIndex !== undefined) {
          installedSkills[previousIndex] = {
            ...previous,
            targetAgents: [...new Set([...previous.targetAgents, ...targetAgents])],
          };
        } else {
          seen.set(key, installedSkills.length);
          installedSkills.push({
            ref: entry.ref,
            scope: artifact.scope,
            installKind: candidate.installKind,
            targetAgents: [...new Set(targetAgents)],
          });
        }
      }
    }
    return { resolution, installedSkills };
  });

/** The install use case: settle a request, then preview or apply it. */
export const InstallExtensions = {
  prepare: prepareInstallExtensions,
  previewOrApply: previewOrApplyInstallExtensions,
} as const;
