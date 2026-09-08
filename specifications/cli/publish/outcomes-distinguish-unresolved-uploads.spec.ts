import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { describe, expect, it } from "@effect/vitest";
import { ExitCodeDefinitions, classifyError } from "axm.sh/specification-harness";
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
    "When publication does not confirm every selected candidate — failing in part or entirely, or being interrupted — AXM shall report each candidate according to the available evidence, retain acknowledged independent successes, block dependents of failed uploads, distinguish unattempted work from dispatched uploads with unknown outcomes, never present a run that confirms no publication as a success in its rendered result or its exit status, and provide credential-free recovery for the unfinished selection.",
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

  /**
   * Every upload is refused with a retryable rejection and no readback proves
   * a settlement, so an uninterrupted apply ends with two dispatched uploads
   * whose outcomes are unknown and nothing confirmed.
   */
  const unsettledUploads = {
    workspace: { settings: { skills: { review: "workspace", format: "workspace" } } },
    upload: () => Effect.succeed(registryProblem("internal", 500)),
  } as const;

  const authorTwoSkills = (root: string): void => {
    for (const name of ["review", "format"]) writeAuthoredSkill(root, { name });
  };

  /** The published meaning of the exit code for a run that reported problems. */
  const issues = ExitCodeDefinitions.find((row) =>
    row.meaning.startsWith("Command ran successfully but reported problems"),
  );

  /** The exit code the process would leave, taken from the run's own failure. */
  const exitCodeOf = (exit: Exit.Exit<unknown, unknown>): number | undefined =>
    Exit.isFailure(exit) ? classifyError(Cause.squash(exit.cause), "json").exitCode : 0;

  it.live("an uninterrupted run that settles nothing leaves every candidate unresolved", () =>
    Effect.scoped(
      Effect.gen(function* () {
        expect(issues).toBeDefined();
        const context = yield* makeRemotePublicationContext(unsettledUploads);
        authorTwoSkills(context.workspace.root);

        const exit = yield* context.run().pipe(Effect.exit);

        // Both candidates were dispatched, and each retried until its
        // attempts were exhausted; no fiber was interrupted.
        expect(context.uploads.length).toBeGreaterThan(2);
        expect(
          [...new Set(context.uploads.map((request) => new URL(request.url).pathname))].sort(),
        ).toEqual([
          "/v1/extensions/@acme/skills/format/1.0.0",
          "/v1/extensions/@acme/skills/review/1.0.0",
        ]);
        expect(exitCodeOf(exit)).toBe(issues?.code);
        const result = yield* context.result();
        expect(result.execution.status).toBe("partial");
        expect(result.execution.outcomes).toEqual(
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
        expect(result.counts).toMatchObject({
          selected: 2,
          published: 0,
          failed: 0,
          blocked: 0,
          unknown: 2,
        });
        expect(result.recovery?.remainingItems).toEqual([
          "@acme/skills/format",
          "@acme/skills/review",
        ]);
      }),
    ),
  );

  it.live(
    "the rendered result of a run that settles nothing names every unresolved candidate",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          expect(issues).toBeDefined();
          const context = yield* makeRemotePublicationContext({
            ...unsettledUploads,
            workspace: { ...unsettledUploads.workspace, machine: false, screen: { kind: "human" } },
          });
          authorTwoSkills(context.workspace.root);

          const exit = yield* context.run().pipe(Effect.exit);

          const streams = context.workspace.streams;
          const rendered = [
            ...(streams?.lines("stdout") ?? []),
            ...(streams?.lines("stderr") ?? []),
          ]
            .join("\n")
            .replaceAll(/\s+/gu, " ");
          // Each candidate is named with the status and phase its evidence
          // supports, and nothing in the rendered run reports a publication.
          for (const name of ["review", "format"]) {
            expect(rendered).toContain(
              `@acme/skills/${name}@1.0.0 — settlement unknown during upload`,
            );
          }
          expect(rendered).not.toMatch(/published/iu);
          expect(exitCodeOf(exit)).toBe(issues?.code);
        }),
      ),
  );
});
