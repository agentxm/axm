/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Log.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../cli-error/index.js";
import { makeLogTestLayer } from "../tui/index.js";
import { displayPlan } from "./display-plan.js";
import type { Plan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type TestOp = { readonly name: string };

const makePlan = (overrides: Partial<Plan<TestOp>> = {}): Plan<TestOp> => ({
  name: "Install skill(s)",
  description: Option.none(),
  jobs: [],
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("displayPlan", () => {
  it.effect("uses plan name as heading", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          name: "Install skill(s)",
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(mockLog.logs.info.some((m) => m.includes("Install skill(s)"))).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows description when present", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          description: Option.some("Install skills from github:owner/repo"),
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.info.some((m) => m.includes("Install skills from github:owner/repo")),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("lists ready items with + prefix for unapplied plan", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "commit",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "review-pr" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      expect(mockLog.logs.success.some((m) => m.includes("+") && m.includes("commit"))).toBe(true);
      expect(mockLog.logs.success.some((m) => m.includes("+") && m.includes("review-pr"))).toBe(
        true,
      );
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows ready item with message in parentheses", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "ready" as const, message: Option.some("new version") },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.success.some(
          (m) => m.includes("+") && m.includes("commit") && m.includes("(new version)"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows skip items with - prefix and message", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "skip" as const, message: "already installed" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.warn.some(
          (m) => m.includes("-") && m.includes("commit") && m.includes("already installed"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows warn items with warning prefix and message", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "warn" as const, message: "version mismatch" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.warn.some(
          (m) => m.includes("\u26A0") && m.includes("commit") && m.includes("version mismatch"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows error readiness items with error prefix and message", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "error" as const, message: "dependency missing" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.error.some(
          (m) => m.includes("\u2717") && m.includes("commit") && m.includes("dependency missing"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows summary counts for unapplied plan", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "commit",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "review-pr" },
                  readiness: { status: "skip" as const, message: "already installed" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.message.some((m) => m.includes("1 to apply") && m.includes("1 to skip")),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("omits zero counts in summary", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      const summary = mockLog.logs.message.find((m) => m.includes("to apply"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("skip");
      expect(summary).not.toContain("error");
      expect(summary).not.toContain("warning");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("includes warn and error counts in unapplied summary", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "a" },
                  readiness: { status: "ready" as const, message: Option.none() },
                  label: "a",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "b" },
                  readiness: { status: "skip" as const, message: "skip reason" },
                  label: "b",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "c" },
                  readiness: { status: "warn" as const, message: "warn reason" },
                  label: "c",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "d" },
                  readiness: { status: "error" as const, message: "error reason" },
                  label: "d",
                },
              ],
            },
          ],
        }),
      );

      const summary = mockLog.logs.message.find((m) => m.includes("to apply"));
      expect(summary).toBeDefined();
      expect(summary).toContain("1 to apply");
      expect(summary).toContain("1 to skip");
      expect(summary).toContain("1 error");
      expect(summary).toContain("1 warning");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("handles all skips case", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "commit" },
                  readiness: { status: "skip" as const, message: "already installed" },
                  label: "commit",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "review-pr" },
                  readiness: { status: "skip" as const, message: "already installed" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      // Should show skipped items
      expect(
        mockLog.logs.warn.some((m) => m.includes("commit") && m.includes("already installed")),
      ).toBe(true);
      expect(
        mockLog.logs.warn.some((m) => m.includes("review-pr") && m.includes("already installed")),
      ).toBe(true);
      // Summary should only have skip count, no apply count
      const summary = mockLog.logs.message.find((m) => m.includes("skip"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("to apply");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows success items with checkmark for applied plan", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "commit" },
                  result: { result: "success" as const, message: "Applied commit" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(mockLog.logs.success.some((m) => m.includes("\u2713") && m.includes("commit"))).toBe(
        true,
      );
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows no-op items with reason for applied plan", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "commit" },
                  result: { result: "no-op" as const, message: "already installed" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.warn.some(
          (m) => m.includes("-") && m.includes("commit") && m.includes("already installed"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows error items for applied plan", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "commit" },
                  result: {
                    result: "error" as const,
                    message: "failed to apply",
                    error: makeCliError({ code: "TEST_STEP_FAILED", what: "failed to apply" }),
                  },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      expect(
        mockLog.logs.error.some(
          (m) => m.includes("\u2717") && m.includes("commit") && m.includes("failed to apply"),
        ),
      ).toBe(true);
      expect(mockLog.logs.error.some((m) => m.includes("commit: failed to apply"))).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows cause lines for step errors in debug mode", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "publish" },
                  result: {
                    result: "error" as const,
                    message: "failed to publish",
                    error: makeCliError({
                      code: "PUBLISH_FAILED",
                      what: "Failed to publish",
                      details: ["Registry URL: https://registry.example.com"],
                      cause: new Error("connection refused"),
                    }),
                  },
                  label: "publish",
                },
              ],
            },
          ],
        }),
        { verbosity: { verbose: true, debug: true } },
      );

      expect(mockLog.logs.error.some((m) => m.includes("Cause: connection refused"))).toBe(true);
      expect(
        mockLog.logs.error.some((m) => m.includes("Registry URL: https://registry.example.com")),
      ).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows past tense summary for applied plan", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "commit" },
                  result: { result: "success" as const, message: "Applied commit" },
                  label: "commit",
                },
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "review-pr" },
                  result: { result: "no-op" as const, message: "already installed" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      const summary = mockLog.logs.message.find((m) => m.includes("applied"));
      expect(summary).toBeDefined();
      expect(summary).toContain("1 applied");
      expect(summary).toContain("1 skipped");
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("omits zero counts in applied summary", () => {
    const [logLayer, mockLog] = makeLogTestLayer();

    return Effect.gen(function* () {
      yield* displayPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "commit" },
                  result: { result: "success" as const, message: "Applied commit" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      const summary = mockLog.logs.message.find((m) => m.includes("applied"));
      expect(summary).toBeDefined();
      expect(summary).not.toContain("skipped");
      expect(summary).not.toContain("failed");
    }).pipe(Effect.provide(logLayer));
  });
});
