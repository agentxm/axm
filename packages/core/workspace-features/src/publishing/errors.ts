/**
 * How the workspace publishing feature refuses. The producer owns the
 * category choice and user-facing wording; the kernel's `OperationRefused`
 * carries them to the application boundary verbatim under the publish
 * policy's diagnostic kind.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { OperationRefused, refusalOf } from "@agentxm/workspace-kernel/operations";

/** The diagnostic a publish policy refusal reports. */
export const publishPolicyRefusal = {
  kind: "publish.policy-refusal",
  operation: "publish.prepare",
} as const;

/** Refuse a publish policy step with the category, wording, and recovery it decided. */
export const publishRefused = refusalOf(publishPolicyRefusal);

/** Whether a failure is a publish policy refusal. */
export const isPublishRefusal = (failure: unknown): failure is OperationRefused =>
  failure instanceof OperationRefused && failure.diagnostic.kind === publishPolicyRefusal.kind;
