import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { VisibilityMutationResultSchema } from "@agentxm/registry-protocol/unstable/publish";

import { set } from "../lifecycle/visibility.js";
import {
  jsonRegistryResponse,
  observedRevision,
  registryProblem,
  registryTarget,
  registryTargetPath,
} from "../test-helpers.js";
import { makeVisibilityWorld, visibilityEvaluation } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/visibility/set/uses-explicit-intent-and-observed-revision",
  title: "Explicit visibility changes carry operator intent and the observed revision",
  statement:
    "The visibility set command shall require established Registry visibility, submit the requested value as operator intent conditional on the observed revision, and report the acknowledged change without silently replacing a rejected precondition.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: ["apps/cli/src/root/visibility/handler.ts", "AgentXM Registry API 0.1.0"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** No terminal and no pending request: the write needs no step-up here. */
const verification = { unattended: true } as const;

describe("Explicit visibility mutation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

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
        const world = makeVisibilityWorld((request) =>
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
        cleanups.push(world.cleanup);

        const outcome = yield* world.provide(
          set({ target: registryTarget, visibility: "private", verification }).pipe(Effect.exit),
        );

        const fails = behavior === "rejected" || behavior === "not-established";
        expect(outcome._tag).toBe(fails ? "Failure" : "Success");
        expect(world.requests[0]?.url.pathname).toBe(`${registryTargetPath}/visibility`);
        expect(world.requests[0]?.url.search).toBe("");
        expect(world.requests.map(({ method }) => method)).toEqual(
          behavior === "not-established" ? ["GET"] : ["GET", "PATCH"],
        );
        if (behavior !== "not-established") {
          expect(world.requests[1]?.url.pathname).toBe(registryTargetPath);
          expect(world.requests[1]).toMatchObject({
            ifMatch: observedRevision,
            body: {
              target: registryTarget,
              visibility: "private",
              revision: observedRevision,
              authority: { kind: "operator" },
            },
          });
        }
        if (!fails && outcome._tag === "Success") {
          const encoded = yield* Schema.encodeUnknownEffect(VisibilityMutationResultSchema)(
            outcome.value.mutation,
          );
          expect(encoded).toEqual(mutation);
        }
      }),
    );
  }
});
