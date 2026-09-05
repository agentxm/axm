import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";

import { captureTelemetry, makeTelemetryOperation } from "../../support/telemetry-harness.js";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

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

// Control the native observation boundary, not command or telemetry behavior.
const identityCollection = vi.hoisted(() => ({ fail: false }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    hostname: () => {
      if (identityCollection.fail) throw new Error("synthetic host observation failure");
      return actual.hostname();
    },
  };
});

describe("Telemetry failure isolation", () => {
  const cleanups: Array<() => void> = [];
  let savedEnable: string | undefined;
  beforeEach(() => {
    identityCollection.fail = false;
    savedEnable = process.env["AXM_TELEMETRY_ENABLE_IN_TEST"];
    process.env["AXM_TELEMETRY_ENABLE_IN_TEST"] = "true";
  });
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (savedEnable === undefined) delete process.env["AXM_TELEMETRY_ENABLE_IN_TEST"];
    else process.env["AXM_TELEMETRY_ENABLE_IN_TEST"] = savedEnable;
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
            expect(baseline.exit._tag).toBe(fail ? "Failure" : "Success");
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
            identityCollection.fail = behavior === "identity-failure";
            const observed = yield* operation.run({
              client,
              fail,
              collectionFailure: behavior === "collection-failure",
            });
            expect(observed.exit._tag).toBe(baseline.exit._tag);
            expect(observed.exitCode).toBe(baseline.exitCode);
            expect(observed.files).toEqual(baseline.files);
            expect(observed.docs).toEqual(baseline.docs);
            expect(observed.settings).toBe(baseline.settings);
            expect(observed.lock).toBe(baseline.lock);
            expect(observed.native).toBe(baseline.native);
            expect(observed.results).toEqual(baseline.results);
            if (behavior === "identity-failure") expect(capture.requests).toHaveLength(0);
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
