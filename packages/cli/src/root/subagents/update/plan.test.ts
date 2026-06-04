/**
 * Unit tests for the subagent update plan builder.
 *
 * Tests version comparison and plan construction.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SubagentLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type { RegistrySubagentRef } from "@agentxm/client-core/unstable/subagents";
import type { JobStepResult } from "@agentxm/client-core/unstable/plan";
import { buildUpdatePlan, type UpdateOperation } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeRegistryRef = (name: string, version: string): RegistrySubagentRef =>
  ({
    type: "subagent",
    refType: "registry",
    name,
    owner: "@test",
    version,
    integrity: Option.none(),
    packages: [],
    subagent: { name, description: "" },
    source: {
      type: "registry",
      location: new URL("file:///test-registry"),
      owner: Option.some("@test"),
      name: "test",
    },
    sourceName: Option.none(),
  }) as unknown as RegistrySubagentRef;

const makeRegistryLockEntry = (version: string): SubagentLockEntry =>
  ({
    type: "registry",
    source: "@test/subagents/test@" + version,
    owner: "@test",
    resolvedVersion: version,
    agents: ["claude-code"],
    installedAt: new Date().toISOString(),
  }) as unknown as SubagentLockEntry;

const noopRunClosure = (_op: UpdateOperation) =>
  Effect.succeed<JobStepResult>({ result: "success", message: "applied" });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUpdatePlan", () => {
  it("marks unchanged registry subagent as up to date", () => {
    const ref = makeRegistryRef("researcher", "1.0.0");
    const lockEntry = makeRegistryLockEntry("1.0.0");
    const ops: ReadonlyArray<UpdateOperation> = [{ ref, force: false }];

    const plan = buildUpdatePlan(
      ops,
      { lockfileVersion: 1, subagents: { researcher: lockEntry } },
      "Update subagents",
      Option.none(),
      noopRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job?.steps).toHaveLength(1);
  });

  it("marks changed registry subagent as needing update", () => {
    const ref = makeRegistryRef("researcher", "2.0.0");
    const lockEntry = makeRegistryLockEntry("1.0.0");
    const ops: ReadonlyArray<UpdateOperation> = [{ ref, force: false }];

    const plan = buildUpdatePlan(
      ops,
      { lockfileVersion: 1, subagents: { researcher: lockEntry } },
      "Update subagents",
      Option.none(),
      noopRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job?.steps).toHaveLength(1);
    const [step] = job?.steps ?? [];
    expect(step?.label).toBe("researcher");
  });

  it("force flag overrides version comparison", () => {
    const ref = makeRegistryRef("researcher", "1.0.0");
    const lockEntry = makeRegistryLockEntry("1.0.0");
    const ops: ReadonlyArray<UpdateOperation> = [{ ref, force: true }];

    const plan = buildUpdatePlan(
      ops,
      { lockfileVersion: 1, subagents: { researcher: lockEntry } },
      "Update subagents",
      Option.none(),
      noopRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job?.steps).toHaveLength(1);
  });

  it("handles empty operations", () => {
    const plan = buildUpdatePlan(
      [],
      { lockfileVersion: 1, subagents: {} },
      "Update subagents",
      Option.none(),
      noopRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job?.steps).toHaveLength(0);
  });
});
