/**
 * Driving the update use case from this package's own tests and
 * specifications.
 *
 * A sweep that finds nothing configured settles without an operation to
 * resolve, so the two resolution helpers return a tagged outcome rather than
 * pretending every request produces an `OperationResolution`. An example that
 * expects work asserts on `Resolved`; an example that expects a no-op asserts
 * on `NothingConfigured` — the same distinction the application renders.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { previewPlanExecution, type OperationResolution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";
import type { PlanExecution } from "@agentxm/workspace-operations";

import type { WorkspaceUpdatableType } from "./configured.js";
import {
  UpdateExtensions,
  type NothingConfiguredUpdateCandidate,
  type UpdateRequest,
} from "./update-extensions.js";

/** `axm update <fqn>`: advance the one extension the person named. */
export const targetedUpdateRequest = (args: {
  readonly source: string;
  readonly nonInteractive?: boolean;
}): UpdateRequest => ({
  kind: "targeted",
  source: args.source,
  nonInteractive: args.nonInteractive ?? true,
});

/** `axm <type> update`: sweep the configured entries, optionally narrowed. */
export const configuredUpdateRequest = (args: {
  readonly type?: WorkspaceUpdatableType;
  readonly names?: ReadonlyArray<string>;
  readonly planName?: string;
  readonly planDescription?: string;
  readonly nonInteractive?: boolean;
}): UpdateRequest => ({
  kind: "configured",
  type: Option.fromUndefinedOr(args.type),
  ...(args.names === undefined ? {} : { names: args.names }),
  planName: args.planName ?? "Update extensions",
  planDescription: Option.fromUndefinedOr(args.planDescription),
  nonInteractive: args.nonInteractive ?? true,
});

/**
 * What an update settled to: an operation that was previewed or applied, or
 * the settled fact that the sweep found nothing configured to advance.
 */
export type UpdateOutcome =
  | { readonly _tag: "Resolved"; readonly resolution: OperationResolution }
  | { readonly _tag: "NothingConfigured"; readonly candidate: NothingConfiguredUpdateCandidate };

const resolveUpdate = (request: UpdateRequest, execution: PlanExecution) =>
  Effect.gen(function* () {
    const candidate = yield* UpdateExtensions.prepare(request);
    if (candidate.outcome === "nothing-configured") {
      return { _tag: "NothingConfigured", candidate } satisfies UpdateOutcome;
    }
    return {
      _tag: "Resolved",
      resolution: yield* UpdateExtensions.previewOrApply(candidate, execution),
    } satisfies UpdateOutcome;
  });

/** Settle an update and preview it: nothing is written. */
export const previewUpdate = (request: UpdateRequest) =>
  resolveUpdate(request, previewPlanExecution);

/** Settle an update and apply it. */
export const applyUpdate = (request: UpdateRequest) =>
  resolveUpdate(request, preapprovedPlanExecution);

/** The resolution an example expected an update to produce. */
export const expectResolved = (outcome: UpdateOutcome): OperationResolution => {
  if (outcome._tag !== "Resolved") {
    throw new Error(
      `Expected the update to resolve an operation, but it settled as nothing-configured: ${outcome.candidate.message}`,
    );
  }
  return outcome.resolution;
};
