/**
 * Unit tests for the subagent update plan builder.
 *
 * Tests version comparison and plan construction.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SubagentLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type { RegistrySubagentRef } from "@agentxm/client-core/unstable/subagents";
import type { JobStepResult } from "@agentxm/client-core/unstable/plan";
import { buildUpdatePlan, type UpdateOperation } from "./plan.js";
import { exactVersion, extensionName, handle } from "../../../test-stubs.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeRegistryRef = (name: string, version: string): RegistrySubagentRef => ({
  type: "subagent",
  refType: "registry",
  name: extensionName(name),
  owner: handle("@test"),
  version: exactVersion(version),
  integrity: Option.none(),
  publisherBindingId: "hbnd_test",
  packages: [],
  subagent: { name: extensionName(name), description: Option.none() },
  source: {
    type: "registry",
    location: new URL("file:///test-registry"),
    owner: Option.some(handle("@test")),
  },
});

const makeRegistryLockEntry = (version: string): SubagentLockEntry => ({
  type: "registry",
  owner: handle("@test"),
  name: extensionName("test"),
  resolvedVersion: exactVersion(version),
  integrity: "sha512-AAAA==",
  sourceName: "test",
  publisherBindingId: "hbnd_test",
  installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
  updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
});

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
      { lockfileVersion: 3, subagents: { researcher: lockEntry } },
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
      { lockfileVersion: 3, subagents: { researcher: lockEntry } },
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
      { lockfileVersion: 3, subagents: { researcher: lockEntry } },
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
      { lockfileVersion: 3, subagents: {} },
      "Update subagents",
      Option.none(),
      noopRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job?.steps).toHaveLength(0);
  });
});
