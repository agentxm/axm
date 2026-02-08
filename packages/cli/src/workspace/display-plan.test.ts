/**
 * Unit tests for displayPlan.
 *
 * Tests the shared plan display module that renders plan summaries via Clack.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeClackTestLayer } from "../clack-effect/index.js";
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
    const [ClackLayer, mock] = makeClackTestLayer();

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

      expect(mock.logs.info.some((m) => m.includes("Install skill(s)"))).toBe(true);
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("shows description when present", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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

      expect(mock.logs.info.some((m) => m.includes("Install skills from github:owner/repo"))).toBe(
        true,
      );
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("lists success items for unapplied plan", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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

      const allMessages = [...mock.logs.info, ...mock.logs.message, ...mock.logs.success];
      expect(allMessages.some((m) => m.includes("commit"))).toBe(true);
      expect(allMessages.some((m) => m.includes("review-pr"))).toBe(true);
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("shows no-op actions with reasons", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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

      const allMessages = [...mock.logs.info, ...mock.logs.warn, ...mock.logs.message];
      expect(allMessages.some((m) => m.includes("commit") && m.includes("already installed"))).toBe(
        true,
      );
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("shows summary counts", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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
        ...mock.logs.info,
        ...mock.logs.message,
        ...mock.logs.success,
        ...mock.logs.warn,
      ];
      expect(allMessages.some((m) => m.includes("1") && m.includes("install"))).toBe(true);
      expect(allMessages.some((m) => m.includes("1") && m.includes("skip"))).toBe(true);
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("handles all no-ops case", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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
        ...mock.logs.info,
        ...mock.logs.message,
        ...mock.logs.success,
        ...mock.logs.warn,
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
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("shows success items with checkmark for applied plan", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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

      const allMessages = [...mock.logs.info, ...mock.logs.message, ...mock.logs.success];
      expect(allMessages.some((m) => m.includes("\u2713") && m.includes("commit"))).toBe(true);
      expect(allMessages.some((m) => m.includes("installed"))).toBe(true);
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("shows past tense summary for applied plan", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

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
        ...mock.logs.info,
        ...mock.logs.message,
        ...mock.logs.success,
        ...mock.logs.warn,
      ];
      expect(allMessages.some((m) => m.includes("1") && m.includes("installed"))).toBe(true);
      expect(allMessages.some((m) => m.includes("1") && m.includes("skipped"))).toBe(true);
    }).pipe(Effect.provide(ClackLayer));
  });
});
