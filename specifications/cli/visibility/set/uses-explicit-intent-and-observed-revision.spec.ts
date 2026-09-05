import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { VisibilityMutationResultSchema } from "@agentxm/registry-protocol/unstable/publish";
import { handleVisibilitySet } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  observedRevision,
  registryProblem,
  registryTarget,
  registryTargetPath,
} from "../../../support/registry-management-harness.js";
import { visibilityEvaluation } from "../../../support/visibility-harness.js";

export const specification = defineSpecification({
  requirement: "cli/visibility/set/uses-explicit-intent-and-observed-revision",
  title: "Explicit visibility changes carry operator intent and the observed revision",
  statement:
    "The visibility set command shall require established Registry visibility, submit the requested value as operator intent conditional on the observed revision, and report the acknowledged change without silently replacing a rejected precondition.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/cli/src/root/visibility/handler.ts", "AgentXM Registry API 0.1.0"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit visibility mutation", () => {
  for (const behavior of ["changed", "already-satisfied", "rejected", "not-established"] as const) {
    it.effect(behavior, () =>
      Effect.gen(function* () {
        const mutation = {
          target: registryTarget,
          before: behavior === "already-satisfied" ? "private" : "public",
          after: "private",
          authority: { kind: "operator" },
          result: behavior === "already-satisfied" ? "already-satisfied" : "changed",
          revision: "opaque-new-revision",
        };
        const context = makeRegistryManagementContext((request) =>
          request.method === "GET"
            ? jsonRegistryResponse(
                visibilityEvaluation(
                  null,
                  behavior === "not-established"
                    ? null
                    : behavior === "already-satisfied"
                      ? "private"
                      : "public",
                ),
              )
            : behavior === "rejected"
              ? registryProblem("conflict", 412)
              : jsonRegistryResponse(mutation),
        );
        const result = yield* context.provide(
          handleVisibilitySet(registryTarget, "private").pipe(Effect.exit),
        );
        const fails = behavior === "rejected" || behavior === "not-established";
        expect(result._tag).toBe(fails ? "Failure" : "Success");
        expect(context.requests[0]?.url.pathname).toBe(`${registryTargetPath}/visibility`);
        expect(context.requests[0]?.url.search).toBe("");
        expect(context.requests.map(({ method }) => method)).toEqual(
          behavior === "not-established" ? ["GET"] : ["GET", "PATCH"],
        );
        if (behavior !== "not-established") {
          expect(context.requests[1]?.url.pathname).toBe(registryTargetPath);
          expect(context.requests[1]).toMatchObject({
            ifMatch: observedRevision,
            body: {
              target: registryTarget,
              visibility: "private",
              revision: observedRevision,
              authority: { kind: "operator" },
            },
          });
        }
        if (fails) expect(context.rendererState.results).toEqual([]);
        else {
          const output = yield* Schema.decodeUnknownEffect(VisibilityMutationResultSchema)(
            context.rendererState.results[0]?.data,
          );
          expect(output).toEqual(mutation);
        }
      }),
    );
  }
});
