/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Log.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
                  expectedResult: { result: "success" as const, message: "Installed commit" },
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
                  expectedResult: { result: "success" as const, message: "Installed commit" },
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

  it.effect("lists success items for unapplied plan", () => {
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
                  expectedResult: { result: "success" as const, message: "Installed commit" },
                  label: "commit",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "review-pr" },
                  expectedResult: { result: "success" as const, message: "Installed review-pr" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      const allMessages = [...mockLog.logs.info, ...mockLog.logs.message, ...mockLog.logs.success];
      expect(allMessages.some((m) => m.includes("commit"))).toBe(true);
      expect(allMessages.some((m) => m.includes("review-pr"))).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows no-op actions with reasons", () => {
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
                  expectedResult: { result: "no-op" as const, message: "already installed" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      const allMessages = [...mockLog.logs.info, ...mockLog.logs.warn, ...mockLog.logs.message];
      expect(allMessages.some((m) => m.includes("commit") && m.includes("already installed"))).toBe(
        true,
      );
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("shows summary counts", () => {
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
                  expectedResult: { result: "success" as const, message: "Installed commit" },
                  label: "commit",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "review-pr" },
                  expectedResult: { result: "no-op" as const, message: "already installed" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      const allMessages = [
        ...mockLog.logs.info,
        ...mockLog.logs.message,
        ...mockLog.logs.success,
        ...mockLog.logs.warn,
      ];
      expect(allMessages.some((m) => m.includes("1") && m.includes("install"))).toBe(true);
      expect(allMessages.some((m) => m.includes("1") && m.includes("skip"))).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });

  it.effect("handles all no-ops case", () => {
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
                  expectedResult: { result: "no-op" as const, message: "already installed" },
                  label: "commit",
                },
                {
                  _tag: "PlannedJobStep" as const,
                  operation: { name: "review-pr" },
                  expectedResult: { result: "no-op" as const, message: "already installed" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      const allMessages = [
        ...mockLog.logs.info,
        ...mockLog.logs.message,
        ...mockLog.logs.success,
        ...mockLog.logs.warn,
      ];
      // Should indicate nothing to execute
      expect(allMessages.some((m) => m.includes("0") && m.includes("install"))).toBe(true);
      // Should show skipped items
      expect(allMessages.some((m) => m.includes("commit") && m.includes("already installed"))).toBe(
        true,
      );
      expect(
        allMessages.some((m) => m.includes("review-pr") && m.includes("already installed")),
      ).toBe(true);
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
                  expectedResult: { result: "success" as const, message: "Installed commit" },
                  actualResult: { result: "success" as const, message: "Installed commit" },
                  label: "commit",
                },
              ],
            },
          ],
        }),
      );

      const allMessages = [...mockLog.logs.info, ...mockLog.logs.message, ...mockLog.logs.success];
      expect(allMessages.some((m) => m.includes("\u2713") && m.includes("commit"))).toBe(true);
      expect(allMessages.some((m) => m.includes("installed"))).toBe(true);
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
                  expectedResult: { result: "success" as const, message: "Installed commit" },
                  actualResult: { result: "success" as const, message: "Installed commit" },
                  label: "commit",
                },
                {
                  _tag: "JobStepResult" as const,
                  operation: { name: "review-pr" },
                  expectedResult: { result: "no-op" as const, message: "already installed" },
                  actualResult: { result: "no-op" as const, message: "already installed" },
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      const allMessages = [
        ...mockLog.logs.info,
        ...mockLog.logs.message,
        ...mockLog.logs.success,
        ...mockLog.logs.warn,
      ];
      expect(allMessages.some((m) => m.includes("1") && m.includes("installed"))).toBe(true);
      expect(allMessages.some((m) => m.includes("1") && m.includes("skipped"))).toBe(true);
    }).pipe(Effect.provide(logLayer));
  });
});
