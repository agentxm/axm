/**
 * Installing hooks packages.
 *
 * A hook becomes observable through each agent's own hook configuration, so
 * its planned artifact is the set of configured-agent outcomes, and an agent
 * that cannot accept the hook blocks the closure rather than failing mid-way.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { HookManager, buildInstallOperation } from "@agentxm/extension-materialization";
import {
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { HOOK_EXTENSION_DIR } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { SourceHostProviders, resolveSource } from "@agentxm/extension-sources";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { applyPlannedProjections } from "@agentxm/workspace-projection";
import {
  ACQUIRED_EXTENSIONS_DIR,
  WorkspaceMutations,
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  type ConfiguredAgentOutcome,
  type HookLockEntry,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { registryLoginSuggestions } from "../../install/registry-login-suggestion.js";
import {
  installRefused,
  type HookInstallIntent,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
} from "../../install/vocabulary.js";

/** A hooks source after grammar parsing, before anything is discovered. */
export interface ParsedHookInstallRequest {
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly owner: Option.Option<Handle>;
  readonly versionRange: Option.Option<VersionRange>;
}

const hookLockEntryVersion = (entry: HookLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const acquiredRoot = (scope: JobStepArtifact["scope"]): string =>
  scope === "project" ? ACQUIRED_EXTENSIONS_DIR : ".axm/workspace/agent_extensions";

const hookRefArtifactPath = (ref: HookExtensionRef, scope: JobStepArtifact["scope"]): string =>
  ref.refType === "workspace"
    ? ref.location
    : acquiredExtensionDisplayPath(acquiredRoot(scope), ref, HOOK_EXTENSION_DIR, ref.name);

const hookInstallArtifactPath = (entry: HookLockEntry, scope: JobStepArtifact["scope"]): string =>
  acquiredExtensionDisplayPathFromLockEntry(
    acquiredRoot(scope),
    entry,
    HOOK_EXTENSION_DIR,
    entry.workspaceName,
  );

/** The artifact an applied hook install reports, from its accepted lock entry. */
export const hookInstallArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly installedBefore: boolean;
  readonly scope: JobStepArtifact["scope"];
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
}): JobStepArtifact => {
  const version = hookLockEntryVersion(args.lockEntry);
  return {
    path: hookInstallArtifactPath(args.lockEntry, args.scope),
    scope: args.scope,
    agents: args.agents,
    ...(version === undefined ? {} : { version }),
    change: args.installedBefore ? "updated" : "created",
    ...(args.agentOutcomes === undefined ? {} : { agentOutcomes: args.agentOutcomes }),
    ...(args.targets.length === 0 ? {} : { fileCount: args.targets.length, targets: args.targets }),
  };
};

/** Read the hooks source grammar: which owner, which names, which range. */
export const parseHookInstallRequest: (
  source: string,
) => Effect.Effect<ParsedHookInstallRequest, ExtensionLifecycleFailed, ResolveInstallRequirements> =
  Effect.fn("InstallExtensions.parseHookRequest")(function* (source: string) {
    const input = source.trim();
    const parsed = parseSourceQualifiedRegistrySourcePatternParts(input);
    const resolved = yield* resolveSource(input).pipe(
      Effect.mapError((error) =>
        installRefused({
          category: "validation",
          detail: `Invalid hooks source: ${error.message}`,
          cause: error,
        }),
      ),
    );

    return {
      source: resolved,
      names: parsed?.type === "hooks" && parsed.name !== undefined ? [parsed.name] : [],
      owner:
        parsed?.type === "hooks"
          ? Option.some(parsed.owner)
          : resolved.type === "registry"
            ? resolved.owner
            : Option.none<Handle>(),
      versionRange:
        resolved.type === "registry" && parsed?.type === "hooks"
          ? Option.fromUndefinedOr(parsed.versionRange)
          : Option.none<VersionRange>(),
    };
  });

/** Discover the hooks packages the parsed source offers. */
export const discoverHookRefs: (
  request: ParsedHookInstallRequest,
) => Effect.Effect<
  ReadonlyArray<HookExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverHooks")(function* (request: ParsedHookInstallRequest) {
  const sources = yield* SourceHostProviders;
  return yield* sources
    .find(request.source, {
      names: request.names,
      type: "hook",
      owner: request.owner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: "Hooks packages could not be discovered from the source",
          cause,
        }),
      ),
      Effect.map((refs) => refs.filter((ref): ref is HookExtensionRef => ref.type === "hook")),
    );
});

/** Settle which hooks packages this request installs, or refuse when none matched. */
export const finalizeHookInstallIntent: (
  request: ParsedHookInstallRequest,
  refs: ReadonlyArray<HookExtensionRef>,
) => Effect.Effect<HookInstallIntent, ExtensionLifecycleFailed> = Effect.fn(
  "InstallExtensions.finalizeHookIntent",
)(function* (request: ParsedHookInstallRequest, refs: ReadonlyArray<HookExtensionRef>) {
  if (refs.length === 0) {
    const suggestions =
      request.source.type === "registry"
        ? yield* registryLoginSuggestions([request.source.location.href])
        : [];
    return yield* installRefused({
      category: "not_found",
      detail: "No hooks packages found in source",
      suggestions,
    });
  }
  return {
    refs: refs.map((ref) => ({
      ref,
      versionRange: ref.refType === "registry" ? request.versionRange : Option.none(),
    })),
  } satisfies HookInstallIntent;
});

/** The closures a settled hook intent becomes. */
export const planHookInstall: (
  intent: HookInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | HookManager
> = Effect.fn("InstallExtensions.planHooks")(function* (intent: HookInstallIntent) {
  const ws = yield* WorkspaceMutations;
  const hookManager = yield* HookManager;
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const memberSteps = yield* Effect.forEach(
    intent.refs,
    ({ ref, versionRange }) =>
      Effect.gen(function* () {
        const installedBefore = yield* hookManager.isInstalled({
          target: { type: "hook", name: ref.hook.name },
        });
        const agentOutcomes =
          hookManager.configuredAgentOutcomesForRef === undefined
            ? []
            : yield* hookManager.configuredAgentOutcomesForRef(ref, "projected");
        const previewPath = hookRefArtifactPath(ref, ws.scope);
        const previewArtifact = {
          path: previewPath,
          scope: ws.scope,
          agents: agentOutcomes
            .filter(({ outcome }) => outcome !== "blocked")
            .map(({ agentId }) => agentId),
          ...(ref.refType === "registry" || ref.refType === "workspace"
            ? { version: ref.version }
            : {}),
          change: installedBefore ? "updated" : "created",
          agentOutcomes,
          targets: Array.from(
            new Map(
              agentOutcomes.flatMap((outcome) =>
                outcome.path === undefined
                  ? []
                  : [
                      [
                        outcome.path,
                        {
                          path: outcome.path,
                          change: installedBefore ? "updated" : "created",
                          agentIds: agentOutcomes
                            .filter(({ path }) => path === outcome.path)
                            .map(({ agentId }) => agentId),
                        },
                      ] as const,
                    ],
              ),
            ).values(),
          ),
        } satisfies JobStepArtifact;
        const operation = buildInstallOperation(hookManager, {
          toStepFailure: lifecycleStepFailure,
          ref,
          versionRange,
          skipProjections: deferProjections,
          installedBefore: Effect.succeed(installedBefore),
          message: `Installed ${ref.hook.name}`,
          buildArtifact: ({ installedBefore }) =>
            Effect.gen(function* () {
              const materialization = yield* hookManager.aggregateProjectionObservation;
              const appliedOutcomes =
                hookManager.configuredAgentOutcomesForRef === undefined
                  ? []
                  : yield* hookManager.configuredAgentOutcomesForRef(ref, "current");
              const currentLockEntry = yield* ws
                .getLockedHookEntry(ref.hook.name)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              if (Option.isNone(currentLockEntry)) {
                const path = hookRefArtifactPath(ref, ws.scope);
                const change = installedBefore ? "updated" : "created";
                return {
                  path,
                  scope: ws.scope,
                  ...(ref.refType === "registry" || ref.refType === "workspace"
                    ? { version: ref.version }
                    : {}),
                  agents: materialization.agents,
                  change,
                  agentOutcomes: appliedOutcomes,
                  targets:
                    materialization.targets.length === 0
                      ? [{ path, change }]
                      : materialization.targets.map((target) => ({ ...target, change })),
                } satisfies JobStepArtifact;
              }
              return hookInstallArtifact({
                lockEntry: currentLockEntry.value,
                installedBefore,
                scope: ws.scope,
                agents: materialization.agents,
                agentOutcomes: appliedOutcomes,
                targets: materialization.targets.map((target) => ({
                  ...target,
                  change: installedBefore ? "updated" : "created",
                })),
              });
            }),
        });
        // An agent that cannot accept this hook is a projection fact, so the
        // closure is refused before it writes rather than failing part-way.
        const blocked = agentOutcomes.filter(({ outcome }) => outcome === "blocked");
        if (blocked.length > 0) {
          return {
            ...(operation.key === undefined ? {} : { key: operation.key }),
            label: operation.label,
            readiness: "error",
            errorMessage: blocked.map(({ agentId, reason }) => `${agentId}: ${reason}`).join("; "),
            artifact: previewArtifact,
          } satisfies PlannedJobStep<InstallStepRequirements>;
        }
        return {
          ...operation,
          artifact: previewArtifact,
        } satisfies PlannedJobStep<InstallStepRequirements>;
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Hook install planning failed for ${ref.hook.name}`,
            cause,
          }),
        ),
      ),
    { concurrency: 1 },
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:hook:units",
            label: "hook projections",
            readiness: "ready",
            run: applyPlannedProjections(hookManager).pipe(
              Effect.mapError(lifecycleStepFailure),
              Effect.as({
                result: "success",
                message: "Rendered installed Hooks from the complete contributor set",
              } satisfies JobStepResult),
            ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install hooks",
    description: Option.some("Install hooks package"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "hook",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});
