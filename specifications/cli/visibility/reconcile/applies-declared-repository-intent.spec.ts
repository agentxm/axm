import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { VisibilityMutationResultSchema } from "@agentxm/registry-protocol/unstable/publish";
import { handleVisibilityReconcile } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  observedRevision,
  registryProblem,
  registryTarget,
} from "../../../support/registry-management-harness.js";
import {
  makeVisibilityWorkspace,
  visibilityEvaluation,
  visibilityIntent,
} from "../../../support/visibility-harness.js";

export const specification = defineSpecification({
  requirement: "cli/visibility/reconcile/applies-declared-repository-intent",
  title: "Visibility reconciliation applies declared repository intent conditionally",
  statement:
    "The visibility reconcile command shall require project-scoped manifest or workspace visibility intent and established Registry visibility, submit the effective intent with its source fingerprint as repository authority conditional on the observed revision, and report only the acknowledged transition.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/cli/src/root/visibility/handler.ts", "AgentXM Registry API 0.1.0"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repository visibility reconciliation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const source of ["manifest", "workspace"] as const) {
    for (const rejected of [false, true]) {
      it.effect(
        `${source} intent ${rejected ? "retains a rejected precondition" : "carries its source fingerprint"}`,
        () =>
          Effect.gen(function* () {
            const workspace = makeVisibilityWorkspace(
              source === "manifest"
                ? { manifest: "private", workspace: "public" }
                : { workspace: "private" },
            );
            cleanups.push(workspace.cleanup);
            const intent = visibilityIntent(source, "private");
            const authority = { kind: "repository", source, fingerprint: intent.fingerprint };
            const mutation = {
              target: registryTarget,
              before: "public",
              after: "private",
              authority,
              result: "changed",
              revision: "opaque-new-revision",
            };
            const context = makeRegistryManagementContext((request) =>
              request.method === "GET"
                ? jsonRegistryResponse(visibilityEvaluation(intent))
                : rejected
                  ? registryProblem("conflict", 412)
                  : jsonRegistryResponse(mutation),
            );
            const result = yield* handleVisibilityReconcile(registryTarget).pipe(
              context.provide,
              Effect.provide(workspace.layer),
              Effect.exit,
            );
            expect(result._tag).toBe(rejected ? "Failure" : "Success");
            expect(context.requests.map(({ method }) => method)).toEqual(["GET", "PATCH"]);
            expect(context.requests[1]).toMatchObject({
              ifMatch: observedRevision,
              body: {
                target: registryTarget,
                visibility: "private",
                revision: observedRevision,
                authority,
              },
            });
            if (rejected) expect(context.rendererState.results).toEqual([]);
            else {
              const output = yield* Schema.decodeUnknownEffect(VisibilityMutationResultSchema)(
                context.rendererState.results[0]?.data,
              );
              expect(output).toEqual(mutation);
            }
          }),
      );
    }
  }
  for (const failure of ["absent-intent", "user-scope", "not-established"] as const) {
    it.effect(`rejects ${failure} before writing`, () =>
      Effect.gen(function* () {
        const workspace = makeVisibilityWorkspace(
          failure === "absent-intent"
            ? {}
            : { manifest: "private", scope: failure === "user-scope" ? "user" : "project" },
        );
        cleanups.push(workspace.cleanup);
        const context = makeRegistryManagementContext(() =>
          jsonRegistryResponse(visibilityEvaluation(visibilityIntent("manifest", "private"), null)),
        );
        const error = yield* handleVisibilityReconcile(registryTarget).pipe(
          Effect.flip,
          context.provide,
          Effect.provide(workspace.layer),
        );
        expect(error).toMatchObject({
          code: failure === "not-established" ? "not_found" : "validation",
        });
        expect(context.requests.map(({ method }) => method)).toEqual(
          failure === "not-established" ? ["GET"] : [],
        );
        expect(context.rendererState.results).toEqual([]);
      }),
    );
  }
});
