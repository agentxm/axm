import {
  collectSkillAcquisitions,
  settledSkillAcquisitions,
  type InstalledSkill,
  type SkillAcquisitionCandidate,
} from "../skill-acquisitions.js";
/**
 * Installing extensions.
 *
 * Root and typed installation require an explicit source. Registry identities,
 * self-describing locators, and paths carry different amounts already known:
 * which type, which source, which versions, and which contents to select.
 *
 * `prepare` settles all of that and writes nothing. The locator form is the
 * reason it must: a locator can carry several extension types at once, and
 * each retained package is one closure inside the prepared candidate. The
 * preview shows all selected components and the operation reports each package outcome.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as Option from "effect/Option";
import * as semver from "semver";
import { isGlobPattern } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  operationPresentation,
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
  normalizeReleaseAgeRecords,
  acceptedPackDependencyResolver,
  type ExtensionResolutionFailed,
} from "@agentxm/workspace-kernel/resolution";

import { prepareAcquisitionPlan } from "../prepare-acquisition-plan.js";
import { withWorkspaceReadView } from "@agentxm/workspace-kernel/workspace-state";
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
import { acceptedInstallRequestRefs } from "./accepted-request.js";
import {
  discoverInstallRefs,
  finalizeInstallRefs,
  parseLocatorInstallRequest,
  parseRegistryQualifiedInstallRequest,
  resolveRegistryInstallRefs,
  type ParsedInstallRequest,
  type SourceInstallRef,
  type SourceInstallType,
} from "./request.js";
import { resolveRootInstallIntent } from "./root-intent.js";
import type { InstallExecutionFailure, PrepareInstallRequirements } from "./vocabulary.js";
import {
  INSTALL_HELD_RELEASE_POLICY,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  findRetainedSourceComponents,
  retainedSelectionSatisfied,
  mergeRetainedSourceRefs,
} from "./retained-source-components.js";
import {
  SourceHostProviders,
  formatRegistryProbe,
  type SourceHostProvidersService,
} from "@agentxm/workspace-kernel/sources";
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
 * What the request installs: one named source or the official bundled skill.
 */
export type InstallSubject =
  { readonly kind: "source"; readonly source: string } | { readonly kind: "bundled" };

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
  readonly diagnostics: InstallDiagnostics;
  readonly execution: ExecutionCandidate<InstallStepRequirements | BundledAxmSkillAsset>;
  readonly skillCandidates: ReadonlyArray<SkillAcquisitionCandidate>;
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

const withInstallReleaseAge = <R>(plan: Plan<R>, evidence: Plan<R>["releaseAge"]): Plan<R> =>
  evidence === undefined
    ? plan
    : {
        ...plan,
        releaseAge: {
          evaluatedAt: evidence.evaluatedAt,
          holdbacks: normalizeReleaseAgeRecords([
            ...evidence.holdbacks,
            ...(plan.releaseAge?.holdbacks ?? []),
          ]),
          bypasses: normalizeReleaseAgeRecords([
            ...evidence.bypasses,
            ...(plan.releaseAge?.bypasses ?? []),
          ]),
        },
      };

const selectsRegistryRelease = (request: Pick<ParsedInstallRequest, "source" | "versionRange">) =>
  request.source.type === "registry" &&
  !(
    Option.isSome(request.versionRange) &&
    semver.valid(request.versionRange.value) === request.versionRange.value
  );

interface PlannedInstall {
  readonly types: ReadonlyArray<InstallableExtensionType>;
  readonly plan: Plan<InstallStepRequirements | BundledAxmSkillAsset>;
  readonly diagnostics: InstallDiagnostics;
}

const combineTypePlans = (
  type: InstallableExtensionType,
  plans: ReadonlyArray<Plan<InstallStepRequirements>>,
): Plan<InstallStepRequirements> => {
  const [only] = plans;
  if (plans.length === 1 && only !== undefined) return only;
  const riskConditions = plans.flatMap((plan) => plan.riskConditions ?? []);
  const failureSuggestions = plans.flatMap((plan) => plan.failureSuggestions ?? []);
  const combined: Plan<InstallStepRequirements> = {
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
  return plans.reduce((result, plan) => withInstallReleaseAge(result, plan.releaseAge), combined);
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

/** One source-backed selection, retaining accepted identity for repeated requests. */
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
    });
    const accepted = repeated;
    const acceptedRefs = accepted.filter(isRequestedType);
    const namedRegistry =
      acceptedRefs.length === 0 &&
      selectsRegistryRelease(parsed) &&
      names.length > 0 &&
      names.every((name) => !isGlobPattern(name))
        ? yield* resolveRegistryInstallRefs(type, parsed, names)
        : undefined;
    const discovered =
      acceptedRefs.length > 0
        ? acceptedRefs
        : namedRegistry !== undefined
          ? namedRegistry.refs.map((entry) => entry.ref)
          : yield* discoverInstallRefs(
              type,
              selectsRegistryRelease(parsed) ? { ...parsed, versionRange: Option.none() } : parsed,
            );
    const selected = yield* selectFrom(discovered, {
      type,
      selectors: names,
      all: request.all,
      nonInteractive: request.nonInteractive,
    });
    const broadRegistry =
      namedRegistry === undefined && acceptedRefs.length === 0 && selectsRegistryRelease(parsed)
        ? yield* resolveRegistryInstallRefs(type, parsed, selected.map(extensionRefName))
        : undefined;
    const resolved = namedRegistry ?? broadRegistry;
    const entries = yield* Effect.sync(() =>
      resolved === undefined
        ? finalizeInstallRefs(parsed, selected)
        : resolved.refs.filter((entry) =>
            selected.some((ref) => extensionRefName(ref) === extensionRefName(entry.ref)),
          ),
    ).pipe(Effect.withSpan("InstallExtensions.finalizeIntent", { attributes: { type } }));
    return {
      refs: entries,
      foundCount: discovered.length,
      resolutionProbes: parsed.resolutionProbes,
      releaseAge: resolved?.releaseAge,
    };
  });

/**
 * Settle which of one type's extensions a source install takes: parse the
 * request, discover what the source offers, and let the person choose. Nothing
 * here reads which coding agents the workspace configures, so a first install
 * can make this choice before it knows them.
 */
const settleTypeChoice = (
  type: InstallableExtensionType,
  source: string,
  request: InstallExtensionsRequest,
) =>
  Effect.gen(function* () {
    const selectors = installSelectorsFor(request.selectors, type);
    switch (type) {
      case "skill":
        return {
          type: "skill" as const,
          settled: yield* settleSourceInstall("skill", source, selectors, request),
        };
      case "subagent":
        return {
          type: "subagent" as const,
          settled: yield* settleSourceInstall("subagent", source, selectors, request),
        };
      case "rule":
        return {
          type: "rule" as const,
          settled: yield* settleSourceInstall("rule", source, selectors, request),
        };
      case "hook":
        return {
          type: "hook" as const,
          settled: yield* settleSourceInstall("hook", source, selectors, request),
        };
      case "knowledge":
        return {
          type: "knowledge" as const,
          settled: yield* settleSourceInstall("knowledge", source, selectors, request),
        };
      case "mcp-server": {
        const parsed = yield* parseMcpServerInstallRequest({
          source,
          force: false,
          localName: request.localName,
          bind: request.bind,
          bindEnv: request.bindEnv,
          ...(request.distributionId === undefined
            ? {}
            : { distributionId: request.distributionId }),
          ...(request.nativeOauth === undefined ? {} : { nativeOauth: request.nativeOauth }),

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

          ...(Option.isSome(parsed.localName) ? { localName: parsed.localName.value } : {}),
        });
        const accepted = repeated;
        const acceptedMcpServers = accepted.filter((ref) => ref.type === "mcp-server");
        const namedRegistry =
          acceptedMcpServers.length === 0 &&
          selectsRegistryRelease({
            source: sourceRequest.source,
            versionRange: parsed.versionRange,
          }) &&
          selectedNames.length > 0 &&
          selectedNames.every((name) => !isGlobPattern(name))
            ? yield* resolveRegistryInstallRefs(
                type,
                {
                  ...sourceRequest,
                  versionRange: parsed.versionRange,
                  names: selectedNames,
                  resolutionProbes: [],
                },
                selectedNames,
                sourceRequest.versionRange,
              )
            : undefined;
        const retained = yield* findRetainedSourceComponents(sourceRequest.source, type);
        const discovered =
          acceptedMcpServers.length > 0
            ? acceptedMcpServers
            : namedRegistry !== undefined
              ? namedRegistry.refs.map((entry) => entry.ref)
              : (retainedSelectionSatisfied(retained, selectedNames)
                  ? retained
                  : mergeRetainedSourceRefs(retained, yield* discoverMcpServerRefs(sourceRequest))
                ).filter((ref) => ref.type === "mcp-server");
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
        const selectedRegistry =
          namedRegistry ??
          (acceptedMcpServers.length === 0 &&
          selectsRegistryRelease({
            source: sourceRequest.source,
            versionRange: parsed.versionRange,
          })
            ? yield* resolveRegistryInstallRefs(
                type,
                {
                  ...sourceRequest,
                  versionRange: parsed.versionRange,
                  names: [],
                  resolutionProbes: [],
                },
                selected.map(extensionRefName),
                sourceRequest.versionRange,
              )
            : undefined);
        return {
          type: "mcp-server" as const,
          parsed,
          sourceRequest,
          selectedRefs: selectedRegistry?.refs.map((entry) => entry.ref) ?? selected,
          releaseAge: selectedRegistry?.releaseAge,
        };
      }
      case "pack": {
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
        });
        const accepted = repeated;
        const acceptedPacks = accepted.filter((ref) => ref.type === "pack");
        const implicitSelectors = Option.toArray(sourceRequest.packName);
        const effectiveSelectors = selectors.length > 0 ? selectors : implicitSelectors;
        const namedRegistry =
          acceptedPacks.length === 0 &&
          selectsRegistryRelease(sourceRequest) &&
          effectiveSelectors.length > 0 &&
          effectiveSelectors.every((name) => !isGlobPattern(name))
            ? yield* resolveRegistryInstallRefs(
                type,
                { ...sourceRequest, names: effectiveSelectors, resolutionProbes: [] },
                effectiveSelectors,
              )
            : undefined;
        const retained = yield* findRetainedSourceComponents(sourceRequest.source, type);
        const discovered =
          acceptedPacks.length > 0
            ? acceptedPacks
            : namedRegistry !== undefined
              ? namedRegistry.refs.map((entry) => entry.ref)
              : (retainedSelectionSatisfied(retained, effectiveSelectors)
                  ? retained
                  : mergeRetainedSourceRefs(retained, yield* discoverPackRefs(sourceRequest))
                ).filter((ref) => ref.type === "pack");
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
        const selectedRegistry =
          namedRegistry ??
          (acceptedPacks.length === 0 && selectsRegistryRelease(sourceRequest)
            ? yield* resolveRegistryInstallRefs(
                type,
                { ...sourceRequest, names: [], resolutionProbes: [] },
                selected.map(extensionRefName),
              )
            : undefined);
        return {
          type: "pack" as const,
          parsed,
          sourceRequest,
          selected,
          selectedRefs: selectedRegistry?.refs.map((entry) => entry.ref) ?? selected,
          releaseAge: selectedRegistry?.releaseAge,
          releaseAgeEvaluation: selectedRegistry?.evaluation,
          accepted: acceptedPacks.length > 0,
        };
      }
    }
  });

/** One type's settled choice, carried from selection to planning. */
type SettledTypeInstall = Effect.Success<ReturnType<typeof settleTypeChoice>>;

const settleForType: (
  type: InstallableExtensionType,
  source: string,
  request: InstallExtensionsRequest,
) => Effect.Effect<
  SettledTypeInstall,
  InstallExtensionsFailure | SelectionRefused,
  PrepareInstallRequirements | InstallSelectionInteraction | BundledAxmSkillAsset
> = settleTypeChoice;

/**
 * Plan one type's settled choice. This is where the configured coding agents
 * are first read, so it runs only in a workspace that already names them.
 */
const planSettledType = (
  settled: SettledTypeInstall,
  source: string,
  request: InstallExtensionsRequest,
): Effect.Effect<
  { readonly plan: Plan<InstallStepRequirements>; readonly diagnostics: InstallDiagnostics },
  InstallExtensionsFailure,
  PrepareInstallRequirements | BundledAxmSkillAsset
> => {
  switch (settled.type) {
    case "skill":
      return Effect.gen(function* () {
        const { refs, foundCount, resolutionProbes, releaseAge } = settled.settled;
        const plan = yield* planSkillInstall({ skillsToInstall: refs });
        const companions = buildCompanionPackagesSection(refs.map(({ ref }) => ref));
        return {
          plan: withInstallReleaseAge(plan, releaseAge),
          diagnostics: {
            resolutionLines: [
              ...(resolutionProbes.length > 0
                ? [`Resolution: ${resolutionProbes.map(formatRegistryProbe).join("; ")}`]
                : []),
              `Found ${foundCount} skill${foundCount === 1 ? "" : "s"}`,
            ],
            companionPackages: companions === undefined ? [] : companions.items,
          },
        };
      });
    case "subagent":
      return Effect.gen(function* () {
        const { refs, foundCount, resolutionProbes, releaseAge } = settled.settled;
        return {
          plan: withInstallReleaseAge(
            yield* planSubagentInstall({ subagentsToInstall: refs }),
            releaseAge,
          ),
          diagnostics: {
            resolutionLines: [
              ...(resolutionProbes.length > 0
                ? [`Resolution: ${resolutionProbes.map(formatRegistryProbe).join("; ")}`]
                : []),
              `Found ${foundCount} subagent${foundCount === 1 ? "" : "s"}`,
            ],
            companionPackages: [],
          },
        };
      });
    case "rule":
      return planRuleInstall({ refs: settled.settled.refs }).pipe(
        Effect.map((plan) => ({
          plan: withInstallReleaseAge(plan, settled.settled.releaseAge),
          diagnostics: EMPTY_DIAGNOSTICS,
        })),
      );
    case "hook":
      return planHookInstall({
        refs: settled.settled.refs,
        ...(request.configuration === undefined ? {} : { configuration: request.configuration }),
      }).pipe(
        Effect.map((plan) => ({
          plan: withInstallReleaseAge(plan, settled.settled.releaseAge),
          diagnostics: EMPTY_DIAGNOSTICS,
        })),
      );
    case "knowledge":
      return planKnowledgeInstall({ refs: settled.settled.refs }).pipe(
        Effect.map((plan) => ({
          plan: withInstallReleaseAge(plan, settled.settled.releaseAge),
          diagnostics: EMPTY_DIAGNOSTICS,
        })),
      );
    case "mcp-server":
      return Effect.gen(function* () {
        const { parsed, sourceRequest } = settled;
        const plans = yield* Effect.forEach(settled.selectedRefs, (selectedRef) =>
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
            return yield* planMcpServerInstall(intent);
          }),
        );
        return {
          plan: withInstallReleaseAge(combineTypePlans(settled.type, plans), settled.releaseAge),
          diagnostics: EMPTY_DIAGNOSTICS,
        };
      });
    case "pack":
      return Effect.gen(function* () {
        const { parsed, sourceRequest } = settled;
        const releaseAgeEvaluation =
          settled.releaseAgeEvaluation ?? (yield* makeConfiguredReleaseAgeEvaluation());
        const plans = yield* Effect.forEach(settled.selectedRefs, (selectedRef) =>
          Effect.gen(function* () {
            const discovery = { ref: selectedRef, probes: [], sourceLabel: source };
            const intent = finalizePackInstallIntent(parsed, discovery, {
              releaseAgeEvaluation,
              heldRelease: INSTALL_HELD_RELEASE_POLICY,
            });
            return yield* planPackInstall({
              ...intent,
              packToInstall: intent.packToInstall,
              ...(settled.accepted ? { dependencyResolver: acceptedPackDependencyResolver() } : {}),
            });
          }),
        );
        return {
          plan: withInstallReleaseAge(combineTypePlans(settled.type, plans), settled.releaseAge),
          diagnostics: {
            resolutionLines: settled.selected.flatMap((ref) =>
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

const nothingInstallable = installRefused({
  category: "not_found",
  detail: "No installable extensions were found in the source",
});

// -----------------------------------------------------------------------------
// select
// -----------------------------------------------------------------------------

/**
 * Which extensions an install takes, settled before anything is planned. A
 * source install carries what each type chose; the bundled skill has nothing
 * to choose. A locator's selection also carries the source view its types
 * shared, so planning reads the same captured checkout.
 */
export type InstallExtensionsSelection =
  | { readonly kind: "bundled" }
  | { readonly kind: "typed"; readonly source: string; readonly settled: SettledTypeInstall }
  | {
      readonly kind: "locator";
      readonly source: string;
      readonly settled: ReadonlyArray<SettledTypeInstall>;
      readonly sources: SourceHostProvidersService;
    };

/**
 * A locator names a place, not a type. Each installable type is offered the
 * source and the ones that find nothing there simply do not contribute; if no
 * type matches, the locator held nothing AXM can install. A refusal the
 * selection itself raised is never "nothing here": it surfaces as is. Every
 * type is asked before any is planned.
 */
const settleLocatorInstall = (source: string, request: InstallExtensionsRequest) =>
  Effect.gen(function* () {
    const explicitlySelectedTypes = installableExtensionTypes.filter(
      (type) => installSelectorsFor(request.selectors, type).length > 0,
    );
    if (request.nonInteractive && !request.all && explicitlySelectedTypes.length === 0) {
      return yield* installRefused({
        category: "usage",
        detail: "A per-type selector or --all is required when no prompt can open",
        recover:
          "Repeat --skill, --subagent, --rule, --hook, --knowledge, --mcp-server, or --pack for selected names, or pass --all",
      });
    }
    const candidateTypes =
      explicitlySelectedTypes.length > 0 ? explicitlySelectedTypes : installableExtensionTypes;
    const sources = yield* SourceHostProviders;
    const locatorSources = yield* makeLocatorSourceView(sources, candidateTypes.length);
    const attempts = yield* Effect.forEach(
      candidateTypes,
      (type) =>
        settleForType(type, source, request).pipe(
          Effect.map(Option.some),
          Effect.catch((failure) =>
            failure._tag === "SelectionRefused"
              ? Effect.fail(failure.failure)
              : isNoMatch(failure)
                ? Effect.succeed(Option.none<SettledTypeInstall>())
                : Effect.fail(failure),
          ),
        ),
      { concurrency: 1 },
    ).pipe(Effect.provideService(SourceHostProviders, locatorSources));
    const settled = attempts.flatMap((attempt) => (Option.isSome(attempt) ? [attempt.value] : []));
    if (settled.length === 0) return yield* nothingInstallable;
    return {
      kind: "locator",
      source,
      settled,
      sources: locatorSources,
    } satisfies InstallExtensionsSelection;
  });

/** Settle what an install takes, asking where the request left it open. */
export const selectInstallExtensions: (
  request: InstallExtensionsRequest,
) => Effect.Effect<
  InstallExtensionsSelection,
  InstallExtensionsFailure,
  PrepareInstallRequirements | InstallSelectionInteraction | BundledAxmSkillAsset
> = Effect.fn("InstallExtensions.select")(function* (request: InstallExtensionsRequest) {
  if (request.subject.kind === "bundled") {
    return { kind: "bundled" } satisfies InstallExtensionsSelection;
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
  if (hasMcpOnlyInput && type !== "mcp-server" && !(type === "locator" && locatorSelectsOnlyMcp)) {
    return yield* installRefused({
      category: "usage",
      detail: "--as and --env are only valid when installing MCP servers",
      recover: "Select MCP servers with --mcp-server, or use an @owner/mcps/name source",
    });
  }

  if (type === "locator") return yield* settleLocatorInstall(source, request);

  const settled = yield* settleForType(type, source, request).pipe(
    Effect.catchTag("SelectionRefused", (refused) => Effect.fail(refused.failure)),
  );
  return { kind: "typed", source, settled } satisfies InstallExtensionsSelection;
}, withWorkspaceReadView);

// -----------------------------------------------------------------------------
// plan
// -----------------------------------------------------------------------------

const planSelection = (
  request: InstallExtensionsRequest,
  selection: InstallExtensionsSelection,
): Effect.Effect<
  PlannedInstall,
  InstallExtensionsFailure,
  PrepareInstallRequirements | BundledAxmSkillAsset
> =>
  Effect.gen(function* () {
    switch (selection.kind) {
      case "bundled":
        return {
          types: ["skill" as const],
          plan: yield* planBundledAxmSkillInstall,
          diagnostics: EMPTY_DIAGNOSTICS,
        } satisfies PlannedInstall;
      case "typed": {
        const { plan, diagnostics } = yield* planSettledType(
          selection.settled,
          selection.source,
          request,
        );
        return {
          types: [selection.settled.type],
          plan,
          diagnostics,
        } satisfies PlannedInstall;
      }
      case "locator": {
        const attempts = yield* Effect.forEach(
          selection.settled,
          (settled) =>
            planSettledType(settled, selection.source, request).pipe(
              Effect.map((planned) => Option.some({ type: settled.type, ...planned })),
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
        ).pipe(Effect.provideService(SourceHostProviders, selection.sources));
        const matched = attempts.flatMap((attempt) =>
          Option.isSome(attempt) ? [attempt.value] : [],
        );
        if (matched.length === 0) return yield* nothingInstallable;

        // Combine type plans before grouping their shared retained package closures.
        const steps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> = matched.flatMap(
          ({ plan }) => plan.jobs.flatMap((job) => job.steps),
        );
        const riskConditions = matched.flatMap(({ plan }) => plan.riskConditions ?? []);
        const failureSuggestions = matched.flatMap(({ plan }) => plan.failureSuggestions ?? []);
        return {
          types: matched.map(({ type }) => type),
          plan: matched.reduce<Plan<InstallStepRequirements>>(
            (result, { plan }) => withInstallReleaseAge(result, plan.releaseAge),
            {
              _tag: "Plan",
              name: request.planName,
              description: request.planDescription,
              presentation: operationPresentation({
                imperative: "install",
                past: "Installed",
                gerund: "Installing",
              }),
              jobs: [{ concurrency: 1, steps, executionPolicy: "best-effort" }],
              ...(riskConditions.length === 0 ? {} : { riskConditions }),
              ...(failureSuggestions.length === 0 ? {} : { failureSuggestions }),
            },
          ),
          diagnostics: {
            resolutionLines: matched.flatMap(({ diagnostics }) => diagnostics.resolutionLines),
            companionPackages: [
              ...new Set(matched.flatMap(({ diagnostics }) => diagnostics.companionPackages)),
            ],
          },
        } satisfies PlannedInstall;
      }
    }
  });

/** Plan a settled selection into a candidate without writing anything. */
export const planInstallExtensions: (
  request: InstallExtensionsRequest,
  selection: InstallExtensionsSelection,
) => Effect.Effect<
  InstallExtensionsCandidate,
  InstallExtensionsFailure,
  PrepareInstallRequirements | BundledAxmSkillAsset
> = Effect.fn("InstallExtensions.plan")(function* (
  request: InstallExtensionsRequest,
  selection: InstallExtensionsSelection,
) {
  const planned = yield* planSelection(request, selection);
  const grouped = yield* prepareAcquisitionPlan(planned.plan, false);
  const skillCandidates =
    request.subject.kind === "bundled" ? [] : yield* collectSkillAcquisitions(grouped, true);
  const execution = yield* prepareExecutionCandidate(grouped);
  return {
    types: planned.types,
    diagnostics: planned.diagnostics,
    execution,
    skillCandidates,
  } satisfies InstallExtensionsCandidate;
}, withWorkspaceReadView);

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle an install without writing anything: select, then plan. */
export const prepareInstallExtensions = (
  request: InstallExtensionsRequest,
): Effect.Effect<
  InstallExtensionsCandidate,
  InstallExtensionsFailure,
  PrepareInstallRequirements | InstallSelectionInteraction | BundledAxmSkillAsset
> =>
  selectInstallExtensions(request).pipe(
    Effect.flatMap((selection) => planInstallExtensions(request, selection)),
    Effect.withSpan("InstallExtensions.prepare"),
  );

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
    const installedSkills = yield* settledSkillAcquisitions(
      candidate.skillCandidates,
      resolution,
      "install",
    );
    return { resolution, installedSkills };
  });

/** The install use case: settle a request, then preview or apply it. */
export const InstallExtensions = {
  select: selectInstallExtensions,
  plan: planInstallExtensions,
  prepare: prepareInstallExtensions,
  previewOrApply: previewOrApplyInstallExtensions,
} as const;
