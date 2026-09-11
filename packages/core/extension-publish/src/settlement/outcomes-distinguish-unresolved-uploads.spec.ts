import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeRemotePublishWorld,
  publicationCapability,
  publishDocument,
  publishFailureOf,
  registryProblem,
  remoteRequest,
  runPublish,
  type RemotePublishWorldOptions,
} from "../test-helpers.js";
import type { PublishOutcome } from "../publish/use-case.js";

export const specification = defineSpecification({
  requirement: "cli/publish/outcomes-distinguish-unresolved-uploads",
  title: "Publication results distinguish confirmed, failed, blocked, pending and unresolved work",
  statement:
    "When publication does not confirm every selected candidate — failing in part or entirely, or being interrupted — AXM shall report each candidate according to the available evidence, retain acknowledged independent successes, block dependents of failed uploads, distinguish unattempted work from dispatched uploads with unknown outcomes, never resolve a run that confirms no publication as a success, and provide credential-free recovery for the unfinished selection.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation", "safe-repetition"],
  methods: ["example", "contract"],
  derivedFrom: [
    "apps/cli/src/root/publish/command.test.ts",
    "packages/core/extension-publish/src/settlement.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "How the unresolved run reads to a person — the rendered lines that name each candidate's unknown settlement and never say a publication happened — and the exit status that run leaves are the application's mapping of this outcome, not the outcome itself, so they are not observed here.",
      retirementCondition:
        "The CLI owns evidence, beside its publish view and exit mapping, that an unsettled run renders every unresolved candidate without reporting a publication and exits with the reported-problems code.",
    },
  ],
});

describe("Publication outcome evidence", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (options: RemotePublishWorldOptions) => {
    const created = makeRemotePublishWorld(options);
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect(
    "retains an independent confirmed upload and blocks a pack whose selected dependency failed",
    () =>
      Effect.gen(function* () {
        const remote = world({
          settings: {
            skills: { review: "workspace", format: "workspace" },
            packs: { toolkit: "workspace" },
          },
          upload: (request, _index, success) =>
            Effect.sync(() =>
              request.url.includes("/skills/review/")
                ? registryProblem("validation", 400)
                : success(request),
            ),
        });
        remote.write("skill", { name: "review" });
        remote.write("skill", { name: "format" });
        remote.write("pack", {
          name: "toolkit",
          dependencies: { "@acme/skills/review": "^1.0.0" },
        });

        const outcome = yield* remote.provide(runPublish(remoteRequest()));

        expect(outcome.disposition._tag).toBe("Failed");
        expect(remote.uploads.map((request) => new URL(request.url).pathname).sort()).toEqual([
          "/v1/extensions/%40acme/skills/format/1.0.0",
          "/v1/extensions/%40acme/skills/review/1.0.0",
        ]);
        const document = publishDocument(outcome);
        expect(document.execution.status).toBe("partial");
        expect(document.execution.outcomes).toEqual(
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
        expect(document.counts).toMatchObject({
          selected: 3,
          published: 1,
          failed: 1,
          blocked: 1,
          unknown: 0,
        });
        expect(outcome.recovery?.remainingItems).toEqual([
          "@acme/skills/review",
          "@acme/packs/toolkit",
        ]);
        expect(outcome.recovery?.blockedDependents).toEqual(["@acme/packs/toolkit"]);
        expect(JSON.stringify(outcome.recovery)).not.toContain(publicationCapability);
      }),
  );

  for (const dispatched of [false, true]) {
    it.effect(
      `interruption ${dispatched ? "after upload dispatch remains unknown" : "before authorization leaves publication pending"}`,
      () =>
        Effect.gen(function* () {
          const reached = yield* Deferred.make<void>();
          const stopHere = Deferred.succeed(reached, undefined).pipe(Effect.andThen(Effect.never));
          const remote = world({
            settings: { skills: { review: "workspace" } },
            ...(dispatched ? { upload: () => stopHere } : { beforeAuthorization: stopHere }),
          });
          remote.write("skill", { name: "review" });

          const recorded: Array<PublishOutcome> = [];
          const fiber = yield* Effect.forkChild(
            remote.provide(runPublish(remoteRequest(), recorded)),
          );
          yield* Deferred.await(reached);
          yield* Fiber.interrupt(fiber);
          // The run terminates as interrupted; the outcome it settled first is
          // what a caller reports.
          const exit = yield* Fiber.await(fiber);
          expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
          const outcome = recorded[0];
          if (outcome === undefined) throw new Error("Expected a settled publish outcome");

          expect(outcome.disposition._tag).toBe("Interrupted");
          expect(remote.uploads).toHaveLength(dispatched ? 1 : 0);
          const document = publishDocument(outcome);
          expect(document.execution.outcomes).toEqual([
            expect.objectContaining({
              id: "@acme/skills/review",
              action: "publish",
              status: dispatched ? "unknown" : "pending",
              reason: "interrupted",
            }),
          ]);
          expect(document.counts).toMatchObject({
            published: 0,
            failed: 0,
            unknown: dispatched ? 1 : 0,
            pending: dispatched ? 0 : 1,
          });
          expect(outcome.recovery?.remainingItems).toEqual(["@acme/skills/review"]);
          expect(outcome.recovery?.description.length).toBeGreaterThan(0);
          for (const secret of [publicationCapability, "SYNTHETIC_PUBLISH_CALLBACK_CODE"])
            expect(JSON.stringify({ document, recovery: outcome.recovery })).not.toContain(secret);
        }),
    );
  }

  /**
   * Every upload is refused with a retryable rejection and no readback proves
   * a settlement, so an uninterrupted apply ends with two dispatched uploads
   * whose outcomes are unknown and nothing confirmed.
   */
  const unsettledUploads = {
    settings: { skills: { review: "workspace", format: "workspace" } },
    upload: () => Effect.succeed(registryProblem("internal", 500)),
  } as const;

  // Every upload retries on a real schedule before its attempts are exhausted,
  // so this row runs on the live clock rather than a virtual one.
  it.live(
    "an uninterrupted run that settles nothing leaves every candidate unresolved",
    () =>
      Effect.gen(function* () {
        const remote = world(unsettledUploads);
        for (const name of ["review", "format"]) remote.write("skill", { name });

        const outcome = yield* remote.provide(runPublish(remoteRequest()));

        // Both candidates were dispatched, and each retried until its
        // attempts were exhausted; no fiber was interrupted.
        expect(remote.uploads.length).toBeGreaterThan(2);
        expect(
          [...new Set(remote.uploads.map((request) => new URL(request.url).pathname))].sort(),
        ).toEqual([
          "/v1/extensions/%40acme/skills/format/1.0.0",
          "/v1/extensions/%40acme/skills/review/1.0.0",
        ]);
        // A run that confirms nothing resolves as reported problems, never as a
        // success: the category the application maps to its exit status.
        expect(publishFailureOf(outcome).category).toBe("issues");
        const document = publishDocument(outcome);
        expect(document.execution.status).toBe("partial");
        expect(document.execution.outcomes).toEqual(
          expect.arrayContaining(
            ["@acme/skills/format", "@acme/skills/review"].map((id) =>
              expect.objectContaining({
                id,
                action: "publish",
                status: "unknown",
                phase: "upload_execution",
              }),
            ),
          ),
        );
        expect(document.counts).toMatchObject({
          selected: 2,
          published: 0,
          failed: 0,
          blocked: 0,
          unknown: 2,
        });
        expect(outcome.recovery?.remainingItems).toEqual([
          "@acme/skills/format",
          "@acme/skills/review",
        ]);
      }),
    30_000,
  );
});
