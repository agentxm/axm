/** Consumer configuration changes preserve acquisition intent and settle native output atomically. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { readExtensionManifest } from "@agentxm/extension-content";
import {
  resolveHookConfiguration,
  type HookConfigurationValues,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { HookManager } from "@agentxm/workspace-kernel/materialization";
import { applyProjectionPlans, observeProjectionPlans } from "@agentxm/workspace-kernel/projection";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import {
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  usableAcceptedCanonicalObservation,
  computePackageContentHash,
} from "@agentxm/workspace-kernel/workspace-state";
import { type PlanExecution } from "@agentxm/workspace-kernel/operations";
import { WorkspaceConfigurationFailed, configurationFailureToStepFailure } from "../errors.js";

const fail = (detail: string, cause?: unknown) =>
  new WorkspaceConfigurationFailed({
    category: "validation",
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

export const prepareConfigureHook = Effect.fn("Hook.prepareConfiguration")(function* (request: {
  readonly name: string;
  /** Replaces consumer values as one document; omitted keys fall back to publisher defaults. */
  readonly configuration: HookConfigurationValues;
}) {
  const location = yield* WorkspaceLocation;
  const path = yield* Path.Path;
  const settings = yield* SettingsReader;
  const writer = yield* SettingsWriter;
  const hooks = yield* HookManager;
  const canonical = yield* usableAcceptedCanonicalObservation({ type: "hook", name: request.name });
  if (Option.isNone(canonical))
    return yield* fail(`Hook extension ${request.name} has no installed package to configure`);
  const packageRoot = canonical.value.observation.path;
  const root = path.relative(location.baseDir, packageRoot);
  const { manifest } = yield* readExtensionManifest(packageRoot, "hook");
  if (manifest.type !== "hook") return yield* fail("The installed package is not a hook extension");
  const resolved = resolveHookConfiguration(manifest, request.configuration);
  if (Result.isFailure(resolved))
    return yield* fail(
      resolved.failure.map((issue) => `${issue.key}: ${issue.message}`).join("; "),
    );
  const entries = yield* settings.entries("hook");
  const previous = entries[request.name];
  const contentHash = yield* computePackageContentHash(packageRoot);
  const next = {
    ...(previous ?? { kind: "configuration" as const }),
    configuration: request.configuration,
  };
  const options = { hookConfigurations: new Map([[request.name, request.configuration]]) };
  const projections = canonical.value.desired.enabled ? yield* hooks.projectionPlans(options) : [];
  yield* observeProjectionPlans(projections);
  const changed = JSON.stringify(previous?.configuration) !== JSON.stringify(request.configuration);
  const artifact = {
    path: root,
    scope: location.scope,
    change: changed ? ("updated" as const) : ("unchanged" as const),
  };
  const run = runWorkspaceTransaction({
    transition: Effect.gen(function* () {
      const currentCanonical = yield* usableAcceptedCanonicalObservation({
        type: "hook",
        name: request.name,
      });
      const current = (yield* settings.entries("hook"))[request.name];
      if (
        Option.isNone(currentCanonical) ||
        currentCanonical.value.observation.path !== packageRoot ||
        JSON.stringify(current) !== JSON.stringify(previous) ||
        (yield* computePackageContentHash(packageRoot)) !== contentHash
      ) {
        return yield* fail(
          "Hook extension content or configuration changed after preview; prepare the change again",
        );
      }
      // Validate every active target before the first write. Native plans retain aggregate ownership.
      const currentProjections = currentCanonical.value.desired.enabled
        ? yield* hooks.projectionPlans(options)
        : [];
      yield* observeProjectionPlans(currentProjections);
      yield* writer.setEntry("hook", request.name, next);
      yield* applyProjectionPlans(currentProjections);
    }),
    validate: () => Effect.void,
  }).pipe(
    Effect.mapError((cause) =>
      configurationFailureToStepFailure(
        fail("Hook extension configuration could not settle", cause),
      ),
    ),
    Effect.as({
      result: "success" as const,
      message: `Configured hook extension ${request.name}`,
      artifact,
    }),
  );
  return yield* prepareExecutionCandidate({
    _tag: "Plan",
    name: "Configure hook extension",
    description: Option.some("Replace consumer settings and reconcile native registrations"),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            key: `hook:${request.name}`,
            label: request.name,
            readiness: "ready",
            artifact,
            materialPaths: [packageRoot],
            run,
          },
        ],
      },
    ],
  });
});

export const ConfigureHook = {
  prepare: prepareConfigureHook,
  previewOrApply: (
    candidate: Effect.Success<ReturnType<typeof prepareConfigureHook>>,
    execution: PlanExecution,
  ) => resolveExecutionCandidate(candidate, execution),
} as const;
