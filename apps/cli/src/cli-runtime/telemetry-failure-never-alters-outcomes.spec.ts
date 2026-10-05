/**
 * Requirement: system/reliability/telemetry-failure-never-alters-outcomes.
 *
 * Bound at the CLI runtime envelope over a real install: each behaviour is
 * compared against the same command run with telemetry off, so "the outcome
 * it would have had" is an observed baseline rather than a restated
 * expectation. Collection failure and identity-storage failure are stated
 * through ports the envelope and its reporter are given — an argument
 * collector that throws, a user home that cannot hold the telemetry
 * directory — not through environment toggles or a module mock. Delivery
 * that rejects, crashes, or stalls is finalized within the invocation: every
 * send it started is completed or interrupted before the command returns.
 */

import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { captureTelemetry, makeTelemetryOperation } from "../test-support/telemetry-harness.js";

export const specification = defineSpecification({
  requirement: "system/reliability/telemetry-failure-never-alters-outcomes",
  title: "Telemetry collection or delivery failure is invisible to the operation",
  statement:
    "When telemetry collection or delivery fails for any reason, the requested operation shall complete with the outcome it would have had without telemetry, and the failure shall neither fail nor alter that operation.",
  class: "quality",
  characteristic: "reliability",
  role: "experience",
  goals: ["privacy-and-consent", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["system/security/telemetry-failure-never-alters-outcomes"],
  supersedes: ["system/security/telemetry-failure-never-alters-outcomes"],
  assumptions: [],
  openQuestions: [],
});

describe("Telemetry failure isolation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const fail of [false, true]) {
    for (const behavior of [
      "success",
      "reject",
      "crash",
      "stall",
      "collection-failure",
      "identity-failure",
    ] as const) {
      // A live clock exercises actual delivery deadlines alongside filesystem I/O.
      it.live(
        `${fail ? "failed" : "successful"} install preserves its result and files with ${behavior} telemetry`,
        () =>
          Effect.gen(function* () {
            const operation = makeTelemetryOperation();
            cleanups.push(operation.cleanup);
            const capture = captureTelemetry();
            const baseline = yield* operation.run({ client: capture.client, mode: "off", fail });
            expect(baseline.exit._tag).toBe("Success");
            expect(capture.requests).toHaveLength(0);
            expect(baseline.exitCode).toBe(fail ? 3 : 0);
            if (!fail) {
              expect(baseline.settings).toContain("review");
              expect(baseline.native).toContain("SYNTHETIC_EXTENSION_CONTENT_71");
            }
            let attempts = 0;
            let finalized = 0;
            const client =
              behavior === "success" ||
              behavior === "collection-failure" ||
              behavior === "identity-failure"
                ? capture.client
                : HttpClient.make((request) =>
                    Effect.sync(() => {
                      attempts += 1;
                    }).pipe(
                      Effect.andThen(
                        behavior === "reject"
                          ? Effect.succeed(
                              HttpClientResponse.fromWeb(
                                request,
                                new Response("unavailable", { status: 503 }),
                              ),
                            )
                          : behavior === "crash"
                            ? Effect.die("synthetic transport crash")
                            : Effect.never,
                      ),
                      Effect.ensuring(
                        Effect.sync(() => {
                          finalized += 1;
                        }),
                      ),
                    ),
                  );
            const observed = yield* operation.run({
              client,
              fail,
              collectionFailure: behavior === "collection-failure",
              ...(behavior === "identity-failure" ? { identityFailure: true } : {}),
            });
            expect(observed.exit._tag).toBe(baseline.exit._tag);
            expect(observed.exitCode).toBe(baseline.exitCode);
            expect(observed.files).toEqual(baseline.files);
            expect(observed.receipts).toEqual(baseline.receipts);
            expect(observed.docs).toEqual(baseline.docs);
            expect(observed.settings).toBe(baseline.settings);
            expect(observed.lock).toBe(baseline.lock);
            expect(observed.native).toBe(baseline.native);
            expect(observed.results).toEqual(baseline.results);
            if (behavior === "identity-failure") {
              // Without an installation identity no usage event is sent, and a
              // failure is still reported, without one.
              expect(capture.requests.map(({ url }) => url.replace(/^.*\/v1\//u, "/v1/"))).toEqual(
                fail ? ["/v1/errors"] : [],
              );
              for (const { body } of capture.requests) {
                expect(body).not.toHaveProperty("installationId");
              }
            }
            if (behavior === "success") expect(capture.requests.length).toBeGreaterThanOrEqual(2);
            if (behavior === "reject" || behavior === "crash" || behavior === "stall") {
              expect(attempts).toBeGreaterThanOrEqual(2);
              expect(finalized).toBe(attempts);
            }
          }),
      );
    }
  }
});
