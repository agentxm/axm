/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Log.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  ClackLogTest,
  ClackLogTestLayer,
  type ClackLogRecord,
} from "../clack-effect/log/ClackLogTest.js";
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
  record: ClackLogRecord,
  method: "message" | "info" | "success" | "warn" | "error",
): ReadonlyArray<string> =>
  record.calls.filter((call) => call.method === method).map((call) => String(call.args[0] ?? ""));

const getLog = Effect.flatMap(ClackLogTest, (t) => t.get);

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("displayPlan", () => {
  it.effect("uses plan name as heading", () =>
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

      const record = yield* getLog;
      expect(messagesByMethod(record, "info").some((m) => m.includes("Install skill(s)"))).toBe(
        true,
      );
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows description when present", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "info").some((m) =>
          m.includes("Install skills from github:owner/repo"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("lists ready items with + prefix for unapplied plan", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "success").some((m) => m.includes("+") && m.includes("commit")),
      ).toBe(true);
      expect(
        messagesByMethod(record, "success").some((m) => m.includes("+") && m.includes("review-pr")),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows warn items with warning prefix and message", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "warn").some(
          (m) => m.includes("\u26A0") && m.includes("commit") && m.includes("version mismatch"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows error readiness items with error prefix and message", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "error").some(
          (m) => m.includes("\u2717") && m.includes("commit") && m.includes("dependency missing"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows summary counts for unapplied plan", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "message").some(
          (m) => m.includes("1 to apply") && m.includes("1 error"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("omits zero counts in summary", () =>
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

      const record = yield* getLog;
      const summary = messagesByMethod(record, "message").find((m) => m.includes("to apply"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("error");
      expect(summary).not.toContain("warning");
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("includes warn and error counts in unapplied summary", () =>
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

      const record = yield* getLog;
      const summary = messagesByMethod(record, "message").find((m) => m.includes("to apply"));
      expect(summary).toBeDefined();
      expect(summary).toContain("1 to apply");
      expect(summary).toContain("1 error");
      expect(summary).toContain("1 warning");
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows success items with checkmark for applied plan", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "success").some(
          (m) => m.includes("\u2713") && m.includes("commit"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows error items for applied plan", () =>
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
                    error: makeCliError({ code: "TEST_STEP_FAILED", what: "failed to apply" }),
                  },
                },
              ],
            },
          ],
        }),
      );

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "error").some(
          (m) => m.includes("\u2717") && m.includes("commit") && m.includes("failed to apply"),
        ),
      ).toBe(true);
      expect(
        messagesByMethod(record, "error").some((m) => m.includes("commit: failed to apply")),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows cause lines for step errors in debug mode", () =>
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

      const record = yield* getLog;
      expect(
        messagesByMethod(record, "error").some((m) => m.includes("Cause: connection refused")),
      ).toBe(true);
      expect(
        messagesByMethod(record, "error").some((m) =>
          m.includes("Registry URL: https://registry.example.com"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("shows past tense summary for applied plan", () =>
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
                    error: makeCliError({ code: "TEST_FAILED", what: "failed" }),
                  },
                },
              ],
            },
          ],
        }),
      );

      const record = yield* getLog;
      const summary = messagesByMethod(record, "message").find((m) => m.includes("applied"));
      expect(summary).toBeDefined();
      expect(summary).toContain("1 applied");
      expect(summary).toContain("1 failed");
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("omits zero counts in applied summary", () =>
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

      const record = yield* getLog;
      const summary = messagesByMethod(record, "message").find((m) => m.includes("applied"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("failed");
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );

  it.effect("uses _tag discriminant to distinguish Plan from ExecutedPlan", () =>
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

      const record = yield* getLog;
      // Should use executed-plan rendering (checkmarks) not planned-plan rendering (+)
      expect(
        messagesByMethod(record, "success").some(
          (m) => m.includes("\u2713") && m.includes("my-step"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(ClackLogTestLayer)),
  );
});
