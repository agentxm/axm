import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  jsonRegistryResponse,
  makeRemotePublishWorld,
  publishDocument,
  remoteRequest,
  runPublish,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/publish/reports-lifecycle-refusal-reason",
  title: "Publication reports the Registry's lifecycle refusal",
  statement:
    "When the Registry refuses an admitted publication because the extension is deleting, held, or archived, AXM shall report that exact lifecycle reason for the failed candidate rather than classify the refusal as an integrity conflict.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "machine-automation"],
  methods: ["example", "contract"],
  derivedFrom: ["packages/core/workspace/src/publishing/publish/use-case.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication lifecycle refusal evidence", () => {
  const worlds: Array<ReturnType<typeof makeRemotePublishWorld>> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  for (const reason of ["deleting", "held", "archived"] as const) {
    it.effect(`reports ${reason} as the failed candidate reason`, () =>
      Effect.gen(function* () {
        const world = makeRemotePublishWorld({
          settings: { skills: { review: "workspace" } },
          upload: () =>
            Effect.succeed(
              jsonRegistryResponse(
                {
                  kind: "LifecycleBlockedError",
                  type: "https://agentxm.ai/problems/lifecycle-blocked",
                  title: "Lifecycle action blocked",
                  status: 409,
                  detail: `The extension is ${reason} and cannot perform this action.`,
                  code: "lifecycle_blocked",
                  reason,
                },
                409,
              ),
            ),
        });
        worlds.push(world);
        world.write("skill", { name: "review" });

        const outcome = yield* world.provide(runPublish(remoteRequest()));

        expect(publishDocument(outcome).execution.outcomes).toEqual([
          expect.objectContaining({
            id: "@acme/skills/review",
            action: "error",
            phase: "upload_execution",
            reason,
            status: "failed",
            cause: expect.objectContaining({
              code: "conflict",
              problemCode: "lifecycle_blocked",
              responseStatus: 409,
            }),
          }),
        ]);
      }),
    );
  }
});
