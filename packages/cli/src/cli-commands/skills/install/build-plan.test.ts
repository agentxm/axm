/**
 * Unit tests for buildPlan.
 *
 * Tests the skills-specific plan builder that diffs operations against lockfile state.
 */

import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { AddSkillOperation } from "../operations.js";
import { buildPlan } from "./build-plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeOp = (name: string): AddSkillOperation => ({
  _tag: "install-skill",
  source: { source: "local", path: "/fake" },
  agents: [],
  force: false,
  skill: { name, description: `${name} skill`, metadata: Option.none() },
  path: Option.some(`/fake/${name}`),
  gitTreeSha: Option.none(),
  registry: Option.none(),
});

const emptyLockfile: Lockfile = {
  lockfileVersion: 1,
  skills: {},
};

const lockfileWith = (...names: string[]): Lockfile => ({
  lockfileVersion: 1,
  skills: Object.fromEntries(
    names.map((name) => [
      name,
      {
        source: "local" as const,
        path: "/installed",
        agents: [],
        installedAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  ),
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildPlan", () => {
  it("marks new skills as execute", () => {
    const plan = buildPlan([makeOp("commit")], emptyLockfile, "Install", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    expect(plan.jobs[0]!.steps[0]!.action).toBe("execute");
    expect(plan.jobs[0]!.steps[0]!.reason).toEqual(Option.none());
  });

  it("marks already-installed skills as no-op", () => {
    const plan = buildPlan([makeOp("commit")], lockfileWith("commit"), "Install", Option.none());

    expect(plan.jobs[0]!.steps[0]!.action).toBe("no-op");
    expect(plan.jobs[0]!.steps[0]!.reason).toEqual(Option.some("already installed"));
  });

  it("produces empty plan from empty operations", () => {
    const plan = buildPlan([], emptyLockfile, "Install", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(0);
  });

  it("derives label from skill name", () => {
    const plan = buildPlan(
      [makeOp("commit"), makeOp("review-pr")],
      emptyLockfile,
      "Install",
      Option.none(),
    );

    expect(plan.jobs[0]!.steps[0]!.label).toBe("commit");
    expect(plan.jobs[0]!.steps[1]!.label).toBe("review-pr");
  });

  it("passes through caller-provided name and description", () => {
    const plan = buildPlan(
      [makeOp("commit")],
      emptyLockfile,
      "Install skill(s)",
      Option.some("Install skills from local:/fake"),
    );

    expect(plan.name).toBe("Install skill(s)");
    expect(plan.description).toEqual(Option.some("Install skills from local:/fake"));
  });

  it("creates a single job with serial concurrency", () => {
    const plan = buildPlan([makeOp("a"), makeOp("b")], emptyLockfile, "Install", Option.none());

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("marks already-installed skills as execute when force is true", () => {
    const op = { ...makeOp("commit"), force: true };
    const plan = buildPlan([op], lockfileWith("commit"), "Install", Option.none());

    expect(plan.jobs[0]!.steps[0]!.action).toBe("execute");
  });

  it("handles mixed execute and no-op actions", () => {
    const plan = buildPlan(
      [makeOp("commit"), makeOp("review-pr"), makeOp("debug")],
      lockfileWith("review-pr"),
      "Install",
      Option.none(),
    );

    const steps = plan.jobs[0]!.steps;
    expect(steps[0]!.action).toBe("execute");
    expect(steps[0]!.label).toBe("commit");
    expect(steps[1]!.action).toBe("no-op");
    expect(steps[1]!.label).toBe("review-pr");
    expect(steps[2]!.action).toBe("execute");
    expect(steps[2]!.label).toBe("debug");
  });
});
