/**
 * Unit tests for scanPlanReadiness.
 *
 * Tests the pure function that scans plan steps and collects readiness statistics.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { scanPlanReadiness } from "./scan-plan-readiness.js";
import type { Plan, PlannedJobStep } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeReadyStep = (label: string): PlannedJobStep => ({
  readiness: "ready",
  label,
  run: Effect.succeed({ result: "success", message: `Done ${label}` }),
});

const makeWarnStep = (label: string, warnMessage: string): PlannedJobStep => ({
  readiness: "warn",
  warnMessage,
  label,
  run: Effect.succeed({ result: "success", message: `Done ${label}` }),
});

const makeErrorStep = (label: string, errorMessage: string): PlannedJobStep => ({
  readiness: "error",
  errorMessage,
  label,
});

const makePlan = (steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Test plan",
  description: Option.none(),
  jobs: steps.length > 0 ? [{ concurrency: 1 as const, steps: [...steps] }] : [],
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("scanPlanReadiness", () => {
  it("returns zero counts for empty plan", () => {
    const report = scanPlanReadiness(makePlan([]));
    expect(report.hasErrors).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.errorMessages).toEqual([]);
    expect(report.warnMessages).toEqual([]);
  });

  it("returns no errors or warnings for all-ready plan", () => {
    const report = scanPlanReadiness(makePlan([makeReadyStep("a"), makeReadyStep("b")]));
    expect(report.hasErrors).toBe(false);
    expect(report.hasWarnings).toBe(false);
    expect(report.errorMessages).toEqual([]);
    expect(report.warnMessages).toEqual([]);
  });

  it("detects error steps", () => {
    const report = scanPlanReadiness(
      makePlan([makeReadyStep("a"), makeErrorStep("b", "dependency missing")]),
    );
    expect(report.hasErrors).toBe(true);
    expect(report.hasWarnings).toBe(false);
    expect(report.errorMessages).toEqual(["b: dependency missing"]);
  });

  it("detects warn steps", () => {
    const report = scanPlanReadiness(
      makePlan([makeReadyStep("a"), makeWarnStep("b", "may conflict")]),
    );
    expect(report.hasErrors).toBe(false);
    expect(report.hasWarnings).toBe(true);
    expect(report.warnMessages).toEqual(["b: may conflict"]);
  });

  it("collects both errors and warnings", () => {
    const report = scanPlanReadiness(
      makePlan([
        makeErrorStep("e1", "err one"),
        makeWarnStep("w1", "warn one"),
        makeErrorStep("e2", "err two"),
        makeWarnStep("w2", "warn two"),
      ]),
    );
    expect(report.hasErrors).toBe(true);
    expect(report.hasWarnings).toBe(true);
    expect(report.errorMessages).toEqual(["e1: err one", "e2: err two"]);
    expect(report.warnMessages).toEqual(["w1: warn one", "w2: warn two"]);
  });

  it("scans across multiple jobs", () => {
    const plan: Plan = {
      _tag: "Plan",
      name: "Multi-job plan",
      description: Option.none(),
      jobs: [
        { concurrency: 1, steps: [makeErrorStep("j1-err", "job 1 error")] },
        { concurrency: "unbounded", steps: [makeWarnStep("j2-warn", "job 2 warning")] },
      ],
    };

    const report = scanPlanReadiness(plan);
    expect(report.hasErrors).toBe(true);
    expect(report.hasWarnings).toBe(true);
    expect(report.errorMessages).toEqual(["j1-err: job 1 error"]);
    expect(report.warnMessages).toEqual(["j2-warn: job 2 warning"]);
  });
});
