/**
 * Unit tests for applyPlan.
 *
 * Tests the shared plan apply module that iterates jobs and logs results via Clack.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeClackTestLayer } from "../clack-effect/index.js";
import { applyPlan } from "./apply-plan.js";
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

describe("applyPlan", () => {
  it.effect("logs success for execute actions", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

    return Effect.gen(function* () {
      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  op: { name: "commit" },
                  action: "execute",
                  reason: Option.none(),
                  label: "commit",
                },
                {
                  op: { name: "review-pr" },
                  action: "execute",
                  reason: Option.none(),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      expect(mock.logs.success).toHaveLength(2);
      expect(mock.logs.success.some((m) => m.includes("commit"))).toBe(true);
      expect(mock.logs.success.some((m) => m.includes("review-pr"))).toBe(true);
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("skips no-op actions", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

    return Effect.gen(function* () {
      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  op: { name: "commit" },
                  action: "execute",
                  reason: Option.none(),
                  label: "commit",
                },
                {
                  op: { name: "review-pr" },
                  action: "no-op",
                  reason: Option.some("already installed"),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      expect(mock.logs.success).toHaveLength(1);
      expect(mock.logs.success[0]).toContain("commit");
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("logs nothing when all actions are no-op", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

    return Effect.gen(function* () {
      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  op: { name: "commit" },
                  action: "no-op",
                  reason: Option.some("already installed"),
                  label: "commit",
                },
                {
                  op: { name: "review-pr" },
                  action: "no-op",
                  reason: Option.some("already installed"),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      expect(mock.logs.success).toHaveLength(0);
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("respects job concurrency setting", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

    return Effect.gen(function* () {
      // Use sequential concurrency (1) — actions should execute in order
      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: 1,
              steps: [
                { op: { name: "first" }, action: "execute", reason: Option.none(), label: "first" },
                {
                  op: { name: "second" },
                  action: "execute",
                  reason: Option.none(),
                  label: "second",
                },
              ],
            },
          ],
        }),
      );

      // With concurrency: 1, both should still be logged
      expect(mock.logs.success).toHaveLength(2);
      // Order should be preserved with sequential execution
      expect(mock.logs.success[0]).toContain("first");
      expect(mock.logs.success[1]).toContain("second");
    }).pipe(Effect.provide(ClackLayer));
  });

  it.effect("processes multiple jobs", () => {
    const [ClackLayer, mock] = makeClackTestLayer();

    return Effect.gen(function* () {
      yield* applyPlan(
        makePlan({
          jobs: [
            {
              concurrency: "unbounded",
              steps: [
                {
                  op: { name: "commit" },
                  action: "execute",
                  reason: Option.none(),
                  label: "commit",
                },
              ],
            },
            {
              concurrency: 1,
              steps: [
                {
                  op: { name: "review-pr" },
                  action: "execute",
                  reason: Option.none(),
                  label: "review-pr",
                },
              ],
            },
          ],
        }),
      );

      expect(mock.logs.success).toHaveLength(2);
    }).pipe(Effect.provide(ClackLayer));
  });
});
