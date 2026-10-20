/**
 * Workspace-backed implementation of the workspace catalog port.
 *
 * The port is declared beside this Layer; the facts behind it — the source
 * hosts the workspace configures and its desired extension graph — come from
 * workspace state, which sits below sources, so the implementation lives
 * beside its port rather than in the application composition root.
 *
 * The port's failure carrier wants a category and a sentence at construction.
 * This module takes both from the kernel's rendering of the workspace failure
 * and carries the typed failure itself in `cause`, so every path renders it
 * the same way.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceCatalog, WorkspaceCatalogUnavailable } from "./workspace-catalog.js";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  type WorkspaceStateReadFailure,
  workspaceStateReadFailureToStepFailure,
} from "../workspace-state/index.js";

/**
 * Carry a workspace failure through the port. Source resolution keys fallback
 * decisions on the category, so the category is the one the workspace-state
 * rendering chose; the sentence and recovery are that rendering's too, and
 * the typed failure itself stays in `cause` so the boundary renders it
 * exactly as it does wherever else it surfaces.
 */
const catalogUnavailable = (failure: WorkspaceStateReadFailure): WorkspaceCatalogUnavailable => {
  const rendered = workspaceStateReadFailureToStepFailure(failure);
  return new WorkspaceCatalogUnavailable({
    category: rendered.category,
    detail: rendered.detail,
    ...(rendered.suggestions === undefined ? {} : { suggestions: rendered.suggestions }),
    cause: failure,
  });
};

export const WorkspaceCatalogLive = Layer.effect(
  WorkspaceCatalog,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const desiredState = yield* DesiredStateReader;

    return {
      workspaceRoot: location.baseDir,
      configuredSources: settings.configuredSources.pipe(Effect.mapError(catalogUnavailable)),
      registrySourceHosts: settings.registrySourceHosts.pipe(Effect.mapError(catalogUnavailable)),
      defaultRegistry: settings.defaultRegistry.pipe(Effect.mapError(catalogUnavailable)),
      desiredExtensionGraph: desiredState.graph().pipe(Effect.mapError(catalogUnavailable)),
    };
  }),
);
