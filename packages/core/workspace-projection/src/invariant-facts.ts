/**
 * Shared invariant-fact evaluation for AXM-owned projection units.
 *
 * Owners register with {@link ProjectionParticipants}, read their native
 * output, and report a normalized observation here. Lint and sync consume the
 * resulting facts without repeating adapter probes.
 *
 * A unit whose owner could not plan or observe it becomes an `unavailable`
 * fact carrying the participant's typed failure. Nothing in this module
 * renders a failure, and no caller supplies rendering to it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { NativeWriteAuthority } from "@agentxm/agent-integration";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as ServiceMap from "effect/Context";
import { observeProjectionPlans } from "./planning.js";
import type { ProjectionParticipantFailure } from "./errors.js";
import {
  aggregateUnitSubject,
  ProjectionParticipants,
  type ProjectionParticipant,
} from "./participants.js";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { acceptedResolutionRef } from "@agentxm/workspace-state";
import { resolveWorkspaceExtensionRef } from "@agentxm/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { OwnershipUnitId, ProjectionUnitObservation } from "./units.js";
import type { ProjectionContributorExclusion } from "./exclusions.js";

export const PROJECTION_INVARIANT_PREDICATE = "workspace/projection-current" as const;

export type ProjectionObservationStatus =
  "current" | "missing" | "incomplete" | "stale" | "obsolete" | "unavailable";

/** Why an owned unit could not be observed at all. */
export type ProjectionUnavailableReasonCode =
  "unsupported-version" | "invalid-ownership" | "unavailable";

/** Adapter readback from one independently owned output unit. */
export interface ProjectionInvariantFact {
  readonly predicate: typeof PROJECTION_INVARIANT_PREDICATE;
  readonly subject: {
    readonly unitId: OwnershipUnitId;
    readonly path: string;
    readonly scope: WorkspaceScope;
    readonly owner?: string;
  };
  readonly authority: {
    readonly source: "desired-state-graph";
    readonly contributors: ReadonlyArray<string>;
  };
  readonly observation: {
    readonly status: ProjectionObservationStatus;
    /** Exact structure-level evidence when the adapter can establish it. */
    readonly contributors?: ReadonlyArray<string>;
    readonly reasonCode?: ProjectionUnavailableReasonCode;
    /**
     * The producing capability's own sentence for an unavailable unit. It is
     * a domain fact, not an application error rendering.
     */
    readonly message?: string;
    /** The typed failure the participant reported, for callers that classify it. */
    readonly failure?: ProjectionParticipantFailure;
    /**
     * Desired contributors the unit could not render. Lint and sync report
     * these so an omission never passes as a complete rendering.
     */
    readonly exclusions?: ReadonlyArray<ProjectionContributorExclusion>;
  };
  readonly expectation: {
    readonly status: "current";
    readonly contributors: ReadonlyArray<string>;
  };
}

/**
 * Classify a participant failure into the unavailability vocabulary lint and
 * sync branch on. Malformed or newer ownership proof blocks reconciliation;
 * every other failure is reported but does not claim the unit is unowned.
 */
export const projectionUnavailability = (
  failure: ProjectionParticipantFailure,
): { readonly reasonCode: ProjectionUnavailableReasonCode; readonly message: string } => {
  switch (failure._tag) {
    case "ManagedRegionViolation":
      return {
        reasonCode:
          failure.reasonCode === "managed-region-unsupported-version"
            ? "unsupported-version"
            : "invalid-ownership",
        message: failure.reason ?? `Managed region cannot be reconciled: ${failure.displayPath}`,
      };
    case "ProjectionTargetUnsupported":
      return { reasonCode: "unavailable", message: failure.detail };
    case "ProjectionIoFailed":
      return {
        reasonCode: "unavailable",
        message: `Managed projection could not be ${failure.step}ed: ${failure.path}`,
      };
    case "DesiredStateIncomplete":
      return { reasonCode: "unavailable", message: failure.problems };
    case "AuthoredContributorUnsupported":
      return {
        reasonCode: "unavailable",
        message: `User workspaces cannot contribute workspace-authored ${failure.type} packages`,
      };
    case "ContributorIdentityInvalid":
      return {
        reasonCode: "unavailable",
        message: `Contributor identity ${failure.identity} does not name a ${failure.type}`,
      };
    case "ContributorUnresolved":
      return {
        reasonCode: "unavailable",
        message: `${failure.type} ${failure.name} has no accepted resolution`,
      };
    case "ContributorTreeMismatch":
      return {
        reasonCode: "unavailable",
        message: `Materialized package does not match its accepted resolution: ${failure.packageRoot}`,
      };
    case "ProjectionParticipantFailed":
      return { reasonCode: "unavailable", message: failure.detail };
  }
};

const uniqueSorted = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

const makeUnavailableProjectionFact = (args: {
  readonly unitId: OwnershipUnitId;
  readonly path: string;
  readonly scope: WorkspaceScope;
  readonly expectedContributors: ReadonlyArray<string>;
  readonly owner?: string;
  readonly failure: ProjectionParticipantFailure;
}): ProjectionInvariantFact => {
  const contributors = uniqueSorted(args.expectedContributors);
  const { message, reasonCode } = projectionUnavailability(args.failure);
  return {
    predicate: PROJECTION_INVARIANT_PREDICATE,
    subject: {
      unitId: args.unitId,
      path: args.path,
      scope: args.scope,
      ...(args.owner === undefined ? {} : { owner: args.owner }),
    },
    authority: { source: "desired-state-graph", contributors },
    observation: { status: "unavailable", reasonCode, message, failure: args.failure },
    expectation: { status: "current", contributors },
  };
};

const observationStatus = (observation: ProjectionUnitObservation): ProjectionObservationStatus => {
  if (observation.current) return "current";
  if (observation.expectedContributors.length === 0) return "obsolete";
  if (!observation.present) return "missing";
  if (observation.observedContributors === undefined) return "stale";
  const observedExpected = observation.observedContributors.filter((contributor) =>
    observation.expectedContributors.includes(contributor),
  );
  if (
    observedExpected.length > 0 &&
    observedExpected.length < observation.expectedContributors.length
  ) {
    return "incomplete";
  }
  return "stale";
};

export const makeProjectionInvariantFact = (
  unit: ProjectionUnitObservation,
  scope: WorkspaceScope,
): ProjectionInvariantFact => {
  const expectedContributors = uniqueSorted(unit.expectedContributors);
  const observedContributors =
    unit.observedContributors === undefined ? undefined : uniqueSorted(unit.observedContributors);
  const status = observationStatus({
    ...unit,
    expectedContributors,
    ...(observedContributors === undefined ? {} : { observedContributors }),
  });
  return {
    predicate: PROJECTION_INVARIANT_PREDICATE,
    subject: {
      unitId: unit.unitId,
      path: unit.path,
      scope,
      ...(unit.owner === undefined ? {} : { owner: unit.owner }),
    },
    authority: { source: "desired-state-graph", contributors: expectedContributors },
    observation: {
      status,
      ...(observedContributors === undefined ? {} : { contributors: observedContributors }),
      ...(unit.exclusions === undefined || unit.exclusions.length === 0
        ? {}
        : { exclusions: unit.exclusions }),
    },
    expectation: { status: "current", contributors: expectedContributors },
  };
};

export const projectionFactIsViolation = (fact: ProjectionInvariantFact): boolean =>
  fact.observation.status !== "current" &&
  (fact.observation.status !== "unavailable" ||
    fact.observation.reasonCode === "unsupported-version");

/** Whether reconciliation is blocked by malformed or unsupported ownership proof. */
export const projectionFactHasInvalidOwnership = (fact: ProjectionInvariantFact): boolean =>
  fact.observation.status === "unavailable" &&
  (fact.observation.reasonCode === "invalid-ownership" ||
    fact.observation.reasonCode === "unsupported-version");

/** Sync work implied by an intrinsic violation or an unready required unit. */
export const projectionFactRequiresReconciliation = (fact: ProjectionInvariantFact): boolean =>
  projectionFactIsViolation(fact) ||
  (fact.observation.status === "unavailable" && fact.expectation.contributors.length > 0);

export interface WorkspaceInvariantFactsService {
  readonly projectionFacts: Effect.Effect<ReadonlyArray<ProjectionInvariantFact>>;
}

export class WorkspaceInvariantFacts extends ServiceMap.Service<
  WorkspaceInvariantFacts,
  WorkspaceInvariantFactsService
>()("@agentxm/workspace-projection/invariant-facts/WorkspaceInvariantFacts") {}

/**
 * Build the live facts service over the participant registry and workspace
 * state reads. Nothing else is required: the owners of the units are reached
 * only through {@link ProjectionParticipants}.
 */
export const WorkspaceInvariantFactsLive = Layer.effect(
  WorkspaceInvariantFacts,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const participants = yield* ProjectionParticipants;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const httpClient = yield* HttpClient.HttpClient;
    const nativeWriteAuthority = yield* NativeWriteAuthority;
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    // Participants keep their requirements explicit; the layer that evaluates
    // the facts is the boundary that composes them.
    const participantLayer = Layer.mergeAll(
      fsPathLayer,
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(NativeWriteAuthority, nativeWriteAuthority),
    );
    const observeParticipant = (participant: ProjectionParticipant) =>
      Effect.result(
        participant
          .projectionPlans()
          .pipe(Effect.flatMap(observeProjectionPlans), Effect.provide(participantLayer)),
      );
    return {
      projectionFacts: Effect.gen(function* () {
        const observed = yield* Effect.forEach(participants.aggregates, observeParticipant, {
          concurrency: "unbounded",
        });
        const facts: Array<ProjectionInvariantFact> = observed.flatMap((result) =>
          Result.isSuccess(result)
            ? result.success.map((observation) =>
                makeProjectionInvariantFact(observation, workspace.scope),
              )
            : [],
        );
        const graph = yield* Effect.result(workspace.getDesiredStateGraph());
        const completeGraph =
          Result.isSuccess(graph) && graph.success.complete
            ? Option.some(graph.success)
            : Option.none();
        if (Option.isSome(completeGraph) && Option.isSome(participants.subagents)) {
          const observer = participants.subagents.value;
          const subagentFacts = yield* Effect.forEach(
            completeGraph.value.nodes.filter((node) => node.type === "subagent" && node.enabled),
            (node) =>
              Effect.result(
                (node.source === "workspace"
                  ? resolveWorkspaceExtensionRef({
                      settingsName: node.name,
                      source: node.source,
                      expectedType: "subagent",
                      layout: workspace.layout,
                      scope: workspace.scope,
                    }).pipe(Effect.map(Option.some))
                  : acceptedResolutionRef({
                      workspace,
                      type: "subagent",
                      name: node.name,
                    })
                ).pipe(
                  Effect.provide(fsPathLayer),
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.succeed(Option.none<ProjectionInvariantFact>()),
                      onSome: (ref) =>
                        ref.type !== "subagent"
                          ? Effect.succeed(Option.none<ProjectionInvariantFact>())
                          : observer.projectionObservation(ref).pipe(
                              Effect.provide(participantLayer),
                              Effect.map((observation) =>
                                Option.some(
                                  makeProjectionInvariantFact(
                                    {
                                      unitId: "subagent:native-profile",
                                      path: `subagent:${node.name}`,
                                      present: observation.present,
                                      current: observation.current,
                                      expectedContributors: [node.identity],
                                      observedContributors: observation.present
                                        ? [node.identity]
                                        : [],
                                    },
                                    workspace.scope,
                                  ),
                                ),
                              ),
                            ),
                    }),
                  ),
                ),
              ),
          );
          facts.push(
            ...subagentFacts.flatMap((result) =>
              Result.isSuccess(result) && Option.isSome(result.success)
                ? [result.success.value]
                : [],
            ),
          );
        }
        if (Option.isNone(completeGraph)) return facts;
        const contributorsFor = (type: string): ReadonlyArray<string> =>
          Option.isSome(completeGraph)
            ? completeGraph.value.nodes
                .filter((node) => node.type === type && node.enabled)
                .map(({ identity }) => identity)
            : [];
        for (const [index, participant] of participants.aggregates.entries()) {
          const result = observed[index];
          if (result === undefined || Result.isSuccess(result)) continue;
          for (const unitId of participant.units) {
            const subject = aggregateUnitSubject(unitId);
            facts.push(
              makeUnavailableProjectionFact({
                unitId,
                path: subject.path,
                scope: workspace.scope,
                expectedContributors: contributorsFor(subject.contributorType),
                ...(subject.owner === undefined ? {} : { owner: subject.owner }),
                failure: result.failure,
              }),
            );
          }
        }
        return facts;
      }),
    };
  }),
);
