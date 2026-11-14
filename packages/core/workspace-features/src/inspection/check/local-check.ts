import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import {
  DesiredStateReader,
  contributorSetBlockers,
  contributorSetComplete,
  WorkspaceLocation,
  formatDesiredIdentity,
  desiredIdentityFqn,
  observeDesiredCanonical,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  aggregateOwnershipUnits,
  WorkspaceInvariantFacts,
} from "@agentxm/workspace-kernel/projection";
import {
  assessOfficialAxmSkill,
  selectOfficialAxmSkill,
} from "@agentxm/workspace-kernel/resolution";
import { AxmSkillCompatibilityPolicy } from "@agentxm/cli-maintenance/official-skill/application";
import { LocalInspection } from "../show/local-inspection.js";
import {
  inspectionReadDiagnostics,
  withLocalAssessmentReadView,
} from "../show/content-read-view.js";
import type { LocalInspectionDocument } from "../show/local-inspection-document.js";
import { expandCheckScope, type CheckSubject } from "./check-scope.js";
import type { LocalCheckOwners } from "./check-owners.js";
import { type LocalCheckRequest } from "./check-selection.js";

/**
 * Capture selected local evidence once. Assessors consume these owner results;
 * this operation never applies the reconciliation steps it obtains.
 */
export const captureLocalCheck = <LE, LR, CE, CR>(
  request: LocalCheckRequest & { readonly userHome: string },
  owners: LocalCheckOwners<LE, LR, CE, CR>,
) =>
  withLocalAssessmentReadView(
    Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const graph = yield* (yield* DesiredStateReader).graph();
      const selection = yield* LocalInspection.query(request);
      const selected = selection.items.flatMap((item): ReadonlyArray<CheckSubject> =>
        item.identity.type === undefined
          ? []
          : [{ type: item.identity.type, name: item.identity.name }],
      );
      const declaredScope = expandCheckScope({ selected, graph, units: [] });
      const projectionFacts =
        declaredScope.subjects.length === 0
          ? []
          : yield* (yield* WorkspaceInvariantFacts).projectionFactsForGraph(
              graph,
              declaredScope.subjects,
            );
      const scope = expandCheckScope({
        selected,
        graph,
        units: projectionFacts.map((fact) => {
          const aggregate = aggregateOwnershipUnits.find(
            ({ unitId }) => unitId === fact.subject.unitId,
          );
          return {
            id: fact.subject.unitId,
            // Contributor authority and output readability are independent evidence.
            complete:
              (aggregate === undefined ||
                contributorSetComplete(contributorSetBlockers(graph, aggregate.type))) &&
              fact.authority.contributors.every((identity) =>
                graph.nodes.some((node) => formatDesiredIdentity(node.identity) === identity),
              ),
            contributors: graph.nodes
              .filter((node) =>
                fact.authority.contributors.includes(formatDesiredIdentity(node.identity)),
              )
              .map(({ type, name }) => ({ type, name })),
          };
        }),
      });
      // One detailed document owns the expanded subjects and its result-local references.
      const extra = scope.subjects.filter((subject) => !subject.requested);
      const inspection =
        extra.length === 0
          ? selection
          : yield* LocalInspection.query({
              ...(request.agents === undefined ? {} : { agents: request.agents }),
              selection: {
                kind: "identities",
                identities: scope.subjects.map((subject) => {
                  const original = selection.items.find(
                    (item) =>
                      item.identity.type === subject.type && item.identity.name === subject.name,
                  );
                  const node = graph.nodes.find(
                    (node) => node.type === subject.type && node.name === subject.name,
                  );
                  const fqn =
                    original?.identity.fqn ??
                    (node === undefined
                      ? undefined
                      : Option.getOrUndefined(desiredIdentityFqn(node.identity)));
                  const sourceName =
                    original?.identity.source.sourceName ??
                    (node?.identity.authority === "registry"
                      ? node.identity.registry.sourceName
                      : undefined);
                  return fqn === undefined
                    ? subject.name
                    : sourceName === undefined
                      ? fqn
                      : `${sourceName}:${fqn}`;
                }),
              },
            });
      const selectedKeys = new Set(scope.subjects.map(({ type, name }) => `${type}:${name}`));
      const compatibility = request.checks.includes("compatibility")
        ? yield* Effect.forEach(
            graph.nodes.filter((node) => selectedKeys.has(`${node.type}:${node.name}`)),
            (node) =>
              observeDesiredCanonical(node).pipe(
                Effect.map((value) => value.observation),
                Effect.result,
                Effect.map((observation) => ({
                  type: node.type,
                  name: node.name,
                  constraint: node.constraint,
                  observation,
                })),
              ),
            { concurrency: 16 },
          )
        : undefined;
      const officialCandidate = selectOfficialAxmSkill(
        (compatibility ?? []).flatMap((entry) => {
          const desired = graph.nodes.find(
            (node) => node.type === entry.type && node.name === entry.name,
          );
          return desired !== undefined && Result.isSuccess(entry.observation)
            ? [{ desired, observation: entry.observation.success }]
            : [];
        }),
      );
      const officialCompatibility = Option.isSome(officialCandidate)
        ? yield* assessOfficialAxmSkill({
            selected: officialCandidate,
            policy: yield* AxmSkillCompatibilityPolicy,
          })
        : undefined;
      const lint = request.checks.includes("lint")
        ? yield* Effect.result(
            owners.lint({
              nativeDirectoryInputs: location.nativeDirectoryInputs,
              platform: { fs, path },
              workspaceRoot: location.baseDir,
              userHome: request.userHome,
              scope: location.scope,
              desiredState: graph,
              subjects: scope.subjects,
            }),
          )
        : undefined;
      const convergence = request.checks.includes("convergence")
        ? yield* Effect.result(
            owners.convergence({
              target: Option.none(),
              types: [],
              ...(request.selection.kind === "all" &&
              (request.types?.length ?? 0) === 0 &&
              (request.agents?.length ?? 0) === 0
                ? {}
                : { subjects: scope.subjects }),
            }),
          )
        : undefined;
      const changedReads = yield* inspectionReadDiagnostics;
      const completedInspection: LocalInspectionDocument = {
        ...inspection,
        observationDiagnostics: [
          ...inspection.observationDiagnostics,
          ...changedReads.filter(
            (diagnostic) =>
              !inspection.observationDiagnostics.some(
                (observed) =>
                  observed.code === diagnostic.code && observed.path === diagnostic.path,
              ),
          ),
        ],
        coverage:
          changedReads.length === 0
            ? inspection.coverage
            : {
                state: "partial",
                reasons: [
                  ...inspection.coverage.reasons,
                  "Content changed while capturing the selected assessments.",
                ],
              },
      };
      return {
        selection,
        inspection: completedInspection,
        scope,
        projectionFacts,
        compatibility,
        officialCompatibility,
        lint,
        convergence,
        /** Evidence capture can finish even when an individual requested owner failed. */
        failedOwners: [
          ...(lint !== undefined && Result.isFailure(lint) ? ["lint"] : []),
          ...(convergence !== undefined && Result.isFailure(convergence) ? ["convergence"] : []),
        ],
      };
    }),
  );
