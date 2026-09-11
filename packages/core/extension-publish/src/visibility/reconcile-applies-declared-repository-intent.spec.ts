import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { VisibilityMutationResultSchema } from "@agentxm/registry-protocol/unstable/publish";

import { reconcile } from "../lifecycle/visibility.js";
import {
  expectPublishFailed,
  jsonRegistryResponse,
  observedRevision,
  registryProblem,
  registryTarget,
} from "../test-helpers.js";
import {
  makeVisibilityWorld,
  visibilityEvaluation,
  visibilityIntent,
  type VisibilityWorldOptions,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/visibility/reconcile/applies-declared-repository-intent",
  title: "Visibility reconciliation applies repository intent at the observed Registry revision",
  statement:
    "The visibility reconcile command shall require project-scoped manifest or workspace visibility intent and established Registry visibility, submit the effective intent with its source fingerprint as repository authority conditional on the observed revision, and report only the acknowledged transition.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: ["apps/cli/src/root/visibility/handler.ts", "AgentXM Registry API 0.1.0"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** No terminal and no pending request: the write needs no step-up here. */
const verification = { unattended: true } as const;

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
            const world = makeVisibilityWorld(
              (request) =>
                request.method === "GET"
                  ? jsonRegistryResponse(visibilityEvaluation(intent))
                  : rejected
                    ? registryProblem("conflict", 412)
                    : jsonRegistryResponse(mutation),
              source === "manifest"
                ? { manifest: "private", workspace: "public" }
                : { workspace: "private" },
            );
            cleanups.push(world.cleanup);

            const outcome = yield* world.provide(
              reconcile({ target: registryTarget, verification }).pipe(Effect.exit),
            );

            expect(outcome._tag).toBe(rejected ? "Failure" : "Success");
            expect(world.requests.map(({ method }) => method)).toEqual(["GET", "PATCH"]);
            expect(world.requests[1]).toMatchObject({
              ifMatch: observedRevision,
              body: {
                target: registryTarget,
                visibility: "private",
                revision: observedRevision,
                authority,
              },
            });
            if (!rejected && outcome._tag === "Success") {
              const encoded = yield* Schema.encodeUnknownEffect(VisibilityMutationResultSchema)(
                outcome.value.mutation,
              );
              expect(encoded).toEqual(mutation);
            }
          }),
      );
    }
  }

  for (const failure of ["absent-intent", "user-scope", "not-established"] as const) {
    it.effect(`rejects ${failure} before writing`, () =>
      Effect.gen(function* () {
        const source: VisibilityWorldOptions =
          failure === "absent-intent"
            ? {}
            : { manifest: "private", scope: failure === "user-scope" ? "user" : "project" };
        const world = makeVisibilityWorld(
          () =>
            jsonRegistryResponse(
              visibilityEvaluation(visibilityIntent("manifest", "private"), null),
            ),
          source,
        );
        cleanups.push(world.cleanup);

        const failed = yield* world.provide(
          Effect.flip(reconcile({ target: registryTarget, verification })),
        );

        expect(expectPublishFailed(failed).category).toBe(
          failure === "not-established" ? "not_found" : "validation",
        );
        expect(world.requests.map(({ method }) => method)).toEqual(
          failure === "not-established" ? ["GET"] : [],
        );
      }),
    );
  }
});
