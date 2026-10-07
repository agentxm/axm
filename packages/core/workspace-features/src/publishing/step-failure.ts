/**
 * The rendering of the publish failure family — publish policy refusals —
 * into the one rendered failure a plan step settles with and the application
 * boundary projects. The Registry access failures a challenged publish settles
 * with are kernel families and render through the kernel.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeStepFailure, type StepFailure } from "@agentxm/workspace-kernel/operations";

import { PublishFailed } from "./errors.js";

/** Every failure the publish feature constructs. */
export type PublishFamilyFailure = PublishFailed;

/** Whether an untyped failure is one the publish feature constructs. */
export const isPublishFamilyFailure = (failure: unknown): failure is PublishFamilyFailure =>
  failure instanceof PublishFailed;

/** Translate one publish policy refusal. */
export const publishFailureToStepFailure = (error: PublishFamilyFailure): StepFailure =>
  makeStepFailure({
    category: error.category,
    diagnostic: error.diagnostic ?? {
      kind: "publish.policy-refusal",
      operation: "publish.prepare",
    },
    detail: error.detail,
    recover: error.recover,
    cmd: error.cmd,
    suggestions: error.suggestions,
    cause: error.cause,
  });
