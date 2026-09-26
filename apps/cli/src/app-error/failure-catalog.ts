/**
 * The application's failure catalog: the workspace kernel's failure families
 * composed with each workspace feature's own family into the one set of typed
 * failures the CLI recognizes and renders.
 *
 * Each family's wording lives once, beside its owner; the catalog only routes
 * a failure to its family, and supplies the rendering of a transition's
 * deciding failure from the whole catalog so that failure reads as it does
 * wherever else it surfaces.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Layer from "effect/Layer";

import {
  authoringFailureToStepFailure,
  isAuthoringFamilyFailure,
  type AuthoringFamilyFailure,
} from "@agentxm/workspace/authoring";
import {
  configurationFailureToStepFailure,
  isConfigurationFamilyFailure,
  type ConfigurationFamilyFailure,
} from "@agentxm/workspace/configuration";
import type { StepFailure } from "@agentxm/workspace/operations";
import {
  isPublishFamilyFailure,
  publishFailureToStepFailure,
  type PublishFamilyFailure,
} from "@agentxm/workspace/publishing";
import {
  isKernelFailure,
  renderKernelFailure,
  StepFailureConversion,
  type KernelFailure,
} from "@agentxm/workspace/reconciliation";

/** Every typed failure the application renders: the kernel's and each feature's. */
export type WorkspaceFailure =
  KernelFailure | AuthoringFamilyFailure | PublishFamilyFailure | ConfigurationFamilyFailure;

/** Whether an untyped failure is one the application renders. */
export const isWorkspaceFailure = (failure: unknown): failure is WorkspaceFailure =>
  isKernelFailure(failure) ||
  isAuthoringFamilyFailure(failure) ||
  isPublishFamilyFailure(failure) ||
  isConfigurationFamilyFailure(failure);

/** A transition's deciding failure reads as it renders wherever else it surfaces. */
const workspaceFailureDetail = (failure: unknown): string | undefined =>
  isWorkspaceFailure(failure) ? workspaceFailureToStepFailure(failure).detail : undefined;

/**
 * Render one workspace failure through its owner's family. A `StepFailure`
 * is already rendered and passes through unchanged.
 */
export const workspaceFailureToStepFailure = (failure: WorkspaceFailure): StepFailure => {
  if (isAuthoringFamilyFailure(failure)) return authoringFailureToStepFailure(failure);
  if (isPublishFamilyFailure(failure)) return publishFailureToStepFailure(failure);
  if (isConfigurationFamilyFailure(failure)) return configurationFailureToStepFailure(failure);
  return renderKernelFailure(failure, { detailOf: workspaceFailureDetail });
};

/** The application's step-failure conversion, provided once per invocation. */
export const WorkspaceFailureConversionLive = Layer.succeed(StepFailureConversion, {
  toStepFailure: (failure) => workspaceFailureToStepFailure(failure),
});
