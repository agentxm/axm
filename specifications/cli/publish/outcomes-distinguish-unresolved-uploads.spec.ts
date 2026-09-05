import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeAuthoredPack, writeAuthoredSkill } from "../../support/publish-harness.js";
import { registryProblem } from "../../support/registry-management-harness.js";
import {
  makeRemotePublicationContext,
  publicationCapability,
} from "../../support/remote-publication-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/outcomes-distinguish-unresolved-uploads",
  title: "Publication results distinguish confirmed, failed, blocked, pending and unresolved work",
  statement:
    "When publication partially fails or is interrupted, AXM shall report each candidate according to the available evidence, retain acknowledged independent successes, block dependents of failed uploads, distinguish unattempted work from dispatched uploads with unknown outcomes, and provide credential-free recovery for the unfinished selection.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation", "safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "packages/cli/src/root/publish/command.internal.test.ts",
    "packages/extension-publish/src/settlement.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Publication outcome evidence", () => {
  it.live(
    "retains an independent confirmed upload and blocks a pack whose selected dependency failed",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* makeRemotePublicationContext({
            workspace: {
              settings: {
                skills: { review: "workspace", format: "workspace" },
                packs: { toolkit: "workspace" },
              },
            },
            upload: (request, _index, success) =>
              Effect.sync(() =>
                request.url.includes("/skills/review/")
                  ? registryProblem("validation", 400)
                  : success(request),
              ),
          });
          writeAuthoredSkill(context.workspace.root, { name: "review" });
          writeAuthoredSkill(context.workspace.root, { name: "format" });
          writeAuthoredPack(context.workspace.root, {
            name: "toolkit",
            dependencies: { "@acme/skills/review": "^1.0.0" },
          });
          const exit = yield* context.run().pipe(Effect.exit);
          expect(exit._tag).toBe("Failure");
          expect(context.uploads.map((request) => new URL(request.url).pathname).sort()).toEqual([
            "/v1/extensions/@acme/skills/format/1.0.0",
            "/v1/extensions/@acme/skills/review/1.0.0",
          ]);
          const result = yield* context.result();
          expect(result.execution.status).toBe("partial");
          expect(result.execution.outcomes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: "@acme/skills/format", status: "success" }),
              expect.objectContaining({ id: "@acme/skills/review", status: "failed" }),
              expect.objectContaining({
                id: "@acme/packs/toolkit",
                status: "blocked",
                blockedBy: ["@acme/skills/review"],
              }),
            ]),
          );
          expect(result.counts).toMatchObject({
            selected: 3,
            published: 1,
            failed: 1,
            blocked: 1,
            unknown: 0,
          });
          expect(result.recovery?.remainingItems).toEqual([
            "@acme/skills/review",
            "@acme/packs/toolkit",
          ]);
          expect(result.recovery?.blockedDependents).toEqual(["@acme/packs/toolkit"]);
          expect(result.recovery?.cmd).not.toContain(publicationCapability);
        }),
      ),
  );

  for (const dispatched of [false, true]) {
    it.live(
      `interruption ${dispatched ? "after upload dispatch remains unknown" : "before authorization leaves publication pending"}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const reached = yield* Deferred.make<void>();
            const stopHere = Deferred.succeed(reached, undefined).pipe(
              Effect.andThen(Effect.never),
            );
            const context = yield* makeRemotePublicationContext({
              workspace: { settings: { skills: { review: "workspace" } } },
              ...(dispatched ? { upload: () => stopHere } : { beforeAuthorization: stopHere }),
            });
            writeAuthoredSkill(context.workspace.root, { name: "review" });
            const fiber = yield* Effect.forkChild(context.run());
            yield* Deferred.await(reached);
            yield* Fiber.interrupt(fiber);
            const exit = yield* Fiber.await(fiber);
            expect(exit._tag).toBe("Failure");
            expect(context.uploads).toHaveLength(dispatched ? 1 : 0);
            const result = yield* context.result();
            expect(result.execution.outcomes).toEqual([
              expect.objectContaining({
                id: "@acme/skills/review",
                action: "publish",
                status: dispatched ? "unknown" : "pending",
                reason: "interrupted",
              }),
            ]);
            expect(result.counts).toMatchObject({
              published: 0,
              failed: 0,
              unknown: dispatched ? 1 : 0,
              pending: dispatched ? 0 : 1,
            });
            expect(result.recovery?.remainingItems).toEqual(["@acme/skills/review"]);
            expect(result.recovery?.cmd).toContain("axm publish");
            for (const secret of [publicationCapability, "SYNTHETIC_PUBLISH_CALLBACK_CODE"])
              expect(JSON.stringify(result)).not.toContain(secret);
          }),
        ),
    );
  }
});
