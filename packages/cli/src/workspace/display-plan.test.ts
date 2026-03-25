/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Log.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeOutputTestLayer, type MockOutputService, Output } from "@axm.sh/core/unstable/output";
import {
  type CliEnvironment,
  type CliEnvironmentService,
  CliEnvironmentTest,
} from "@axm.sh/core/unstable/cli-flags";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { displayPlan } from "./display-plan.js";
import type { Plan, ExecutedPlan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makePlan = (overrides: Partial<Plan> = {}): Plan => ({
  _tag: "Plan",
  name: "Install skill(s)",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

const makeExecutedPlan = (overrides: Partial<ExecutedPlan> = {}): ExecutedPlan => ({
  _tag: "ExecutedPlan",
  name: "Install skill(s)",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

const messagesByMethod = (
  mock: MockOutputService,
  method: "message" | "info" | "success" | "warn" | "error",
): ReadonlyArray<string> =>
  mock.calls.filter((call) => call.method === method).map((call) => String(call.args[0] ?? ""));

/** Creates a fresh output + CliEnvironment test layer and runs the effect, returning the mock for inspection. */
const withOutput = <A, E>(
  fn: (mock: MockOutputService) => Effect.Effect<A, E, Output | CliEnvironment>,
  flagsOverrides?: Partial<CliEnvironmentService>,
): Effect.Effect<A, E> => {
  const [outputLayer, mock] = makeOutputTestLayer();
  return fn(mock).pipe(
    Effect.provide(Layer.mergeAll(outputLayer, CliEnvironmentTest(flagsOverrides))),
  );
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("displayPlan", () => {
  it.effect("uses plan name as heading", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            name: "Install skill(s)",
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(messagesByMethod(mock, "info").some((m) => m.includes("Install skill(s)"))).toBe(
          true,
        );
      }),
    ),
  );

  it.effect("shows description when present", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            description: Option.some("Install skills from github:owner/repo"),
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "info").some((m) =>
            m.includes("Install skills from github:owner/repo"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("lists ready items with + prefix for unapplied plan", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "ready",
                    label: "review-pr",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "success").some((m) => m.includes("+") && m.includes("commit")),
        ).toBe(true);
        expect(
          messagesByMethod(mock, "success").some((m) => m.includes("+") && m.includes("review-pr")),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows warn items with warning prefix and message", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "warn",
                    warnMessage: "version mismatch",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "warn").some(
            (m) => m.includes("\u26A0") && m.includes("commit") && m.includes("version mismatch"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows error readiness items with error prefix and message", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "error",
                    errorMessage: "dependency missing",
                    label: "commit",
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "error").some(
            (m) => m.includes("\u2717") && m.includes("commit") && m.includes("dependency missing"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows summary counts for unapplied plan", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "error",
                    errorMessage: "missing dep",
                    label: "review-pr",
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "message").some(
            (m) => m.includes("1 to apply") && m.includes("1 error"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("omits zero counts in summary", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "commit",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                ],
              },
            ],
          }),
        );

        const summary = messagesByMethod(mock, "message").find((m) => m.includes("to apply"));
        expect(summary).toBeDefined();
        expect(summary).not.toContain("error");
        expect(summary).not.toContain("warning");
      }),
    ),
  );

  it.effect("includes warn and error counts in unapplied summary", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makePlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    readiness: "ready",
                    label: "a",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "warn",
                    warnMessage: "warn reason",
                    label: "c",
                    run: Effect.succeed({ result: "success", message: "ok" }),
                  },
                  {
                    readiness: "error",
                    errorMessage: "error reason",
                    label: "d",
                  },
                ],
              },
            ],
          }),
        );

        const summary = messagesByMethod(mock, "message").find((m) => m.includes("to apply"));
        expect(summary).toBeDefined();
        expect(summary).toContain("1 to apply");
        expect(summary).toContain("1 error");
        expect(summary).toContain("1 warning");
      }),
    ),
  );

  it.effect("shows success items with checkmark for applied plan", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: { result: "success", message: "Applied commit" },
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "success").some(
            (m) => m.includes("\u2713") && m.includes("commit"),
          ),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows error items for applied plan", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: {
                      result: "error",
                      message: "failed to apply",
                      error: makeAppError({ code: "TEST_STEP_FAILED", what: "failed to apply" }),
                    },
                  },
                ],
              },
            ],
          }),
        );

        expect(
          messagesByMethod(mock, "error").some(
            (m) => m.includes("\u2717") && m.includes("commit") && m.includes("failed to apply"),
          ),
        ).toBe(true);
        expect(
          messagesByMethod(mock, "error").some((m) => m.includes("commit: failed to apply")),
        ).toBe(true);
      }),
    ),
  );

  it.effect("shows cause lines for step errors in debug mode", () =>
    withOutput(
      (mock) =>
        Effect.gen(function* () {
          yield* displayPlan(
            makeExecutedPlan({
              jobs: [
                {
                  concurrency: "unbounded",
                  steps: [
                    {
                      label: "publish",
                      result: {
                        result: "error",
                        message: "failed to publish",
                        error: makeAppError({
                          code: "PUBLISH_FAILED",
                          what: "Failed to publish",
                          details: ["Registry URL: https://registry.example.com"],
                          cause: new Error("connection refused"),
                        }),
                      },
                    },
                  ],
                },
              ],
            }),
          );

          expect(
            messagesByMethod(mock, "error").some((m) => m.includes("Cause: connection refused")),
          ).toBe(true);
          expect(
            messagesByMethod(mock, "error").some((m) =>
              m.includes("Registry URL: https://registry.example.com"),
            ),
          ).toBe(true);
        }),
      { verbose: true, debug: true },
    ),
  );

  it.effect("shows past tense summary for applied plan", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: { result: "success", message: "Applied commit" },
                  },
                  {
                    label: "review-pr",
                    result: {
                      result: "error",
                      message: "failed",
                      error: makeAppError({ code: "TEST_FAILED", what: "failed" }),
                    },
                  },
                ],
              },
            ],
          }),
        );

        const summary = messagesByMethod(mock, "message").find((m) => m.includes("applied"));
        expect(summary).toBeDefined();
        expect(summary).toContain("1 applied");
        expect(summary).toContain("1 failed");
      }),
    ),
  );

  it.effect("omits zero counts in applied summary", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "commit",
                    result: { result: "success", message: "Applied commit" },
                  },
                ],
              },
            ],
          }),
        );

        const summary = messagesByMethod(mock, "message").find((m) => m.includes("applied"));
        expect(summary).toBeDefined();
        expect(summary).not.toContain("failed");
      }),
    ),
  );

  it.effect("uses _tag discriminant to distinguish Plan from ExecutedPlan", () =>
    withOutput((mock) =>
      Effect.gen(function* () {
        // An ExecutedPlan with _tag should render completed steps (checkmarks)
        yield* displayPlan(
          makeExecutedPlan({
            jobs: [
              {
                concurrency: "unbounded",
                steps: [
                  {
                    label: "my-step",
                    result: { result: "success", message: "done" },
                  },
                ],
              },
            ],
          }),
        );

        // Should use executed-plan rendering (checkmarks) not planned-plan rendering (+)
        expect(
          messagesByMethod(mock, "success").some(
            (m) => m.includes("\u2713") && m.includes("my-step"),
          ),
        ).toBe(true);
      }),
    ),
  );
});
