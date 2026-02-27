/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Log.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeClackLogTestLayer, type MockClackLogService } from "../clack-effect/index.js";
import { makeCliError } from "../cli-error/index.js";
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
  mockLog: MockClackLogService,
  method: "message" | "info" | "success" | "warn" | "error",
): ReadonlyArray<string> =>
  mockLog.calls.filter((call) => call.method === method).map((call) => String(call.args[0] ?? ""));

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("displayPlan", () => {
  it.effect("uses plan name as heading", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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

      expect(messagesByMethod(mockLog, "info").some((m) => m.includes("Install skill(s)"))).toBe(
        true,
      );
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows description when present", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "info").some((m) =>
          m.includes("Install skills from github:owner/repo"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("lists ready items with + prefix for unapplied plan", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "success").some((m) => m.includes("+") && m.includes("commit")),
      ).toBe(true);
      expect(
        messagesByMethod(mockLog, "success").some(
          (m) => m.includes("+") && m.includes("review-pr"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows warn items with warning prefix and message", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "warn").some(
          (m) => m.includes("\u26A0") && m.includes("commit") && m.includes("version mismatch"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows error readiness items with error prefix and message", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "error").some(
          (m) => m.includes("\u2717") && m.includes("commit") && m.includes("dependency missing"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows summary counts for unapplied plan", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "message").some(
          (m) => m.includes("1 to apply") && m.includes("1 error"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("omits zero counts in summary", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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

      const summary = messagesByMethod(mockLog, "message").find((m) => m.includes("to apply"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("error");
      expect(summary).not.toContain("warning");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("includes warn and error counts in unapplied summary", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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

      const summary = messagesByMethod(mockLog, "message").find((m) => m.includes("to apply"));
      expect(summary).toBeDefined();
      expect(summary).toContain("1 to apply");
      expect(summary).toContain("1 error");
      expect(summary).toContain("1 warning");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows success items with checkmark for applied plan", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "success").some(
          (m) => m.includes("\u2713") && m.includes("commit"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows error items for applied plan", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
                    error: makeCliError({ code: "TEST_STEP_FAILED", what: "failed to apply" }),
                  },
                },
              ],
            },
          ],
        }),
      );

      expect(
        messagesByMethod(mockLog, "error").some(
          (m) => m.includes("\u2717") && m.includes("commit") && m.includes("failed to apply"),
        ),
      ).toBe(true);
      expect(
        messagesByMethod(mockLog, "error").some((m) => m.includes("commit: failed to apply")),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows cause lines for step errors in debug mode", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
                    error: makeCliError({
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
        { verbosity: { verbose: true, debug: true } },
      );

      expect(
        messagesByMethod(mockLog, "error").some((m) => m.includes("Cause: connection refused")),
      ).toBe(true);
      expect(
        messagesByMethod(mockLog, "error").some((m) =>
          m.includes("Registry URL: https://registry.example.com"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows past tense summary for applied plan", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
                    error: makeCliError({ code: "TEST_FAILED", what: "failed" }),
                  },
                },
              ],
            },
          ],
        }),
      );

      const summary = messagesByMethod(mockLog, "message").find((m) => m.includes("applied"));
      expect(summary).toBeDefined();
      expect(summary).toContain("1 applied");
      expect(summary).toContain("1 failed");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("omits zero counts in applied summary", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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

      const summary = messagesByMethod(mockLog, "message").find((m) => m.includes("applied"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("failed");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("uses _tag discriminant to distinguish Plan from ExecutedPlan", () => {
    const [logLayer, mockLog] = makeClackLogTestLayer();

    return Effect.gen(function* () {
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
        messagesByMethod(mockLog, "success").some(
          (m) => m.includes("\u2713") && m.includes("my-step"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });
});
