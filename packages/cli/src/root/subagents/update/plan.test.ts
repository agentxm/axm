/**
 * Unit tests for the subagent update plan builder.
 *
 * Tests version comparison and plan construction.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { RegistrySubagentRef } from "@agentxm/client-core/unstable/subagents";
import type { JobStepResult } from "@agentxm/client-core/unstable/plan";
import type { WorkspaceTrustState } from "@agentxm/client-core/unstable/trust";
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

const trustStateWith = (name: string, version: string | undefined): WorkspaceTrustState => ({
  trustStateVersion: 1,
  records:
    version === undefined
      ? {}
      : {
          [`subagent:${name}`]: {
            extensionType: "subagent",
            name,
            authority: "registry",
            sourceIdentity: `@test/subagents/${name}`,
            resolvedVersion: version,
            publisherBindingId: "hbnd_test",
            integrity: "sha512-AAAA==",
          },
        },
});

const noopRunClosure = (_op: UpdateOperation) =>
  Effect.succeed<JobStepResult>({ result: "success", message: "applied" });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildUpdatePlan", () => {
  it("marks unchanged registry subagent as up to date", () => {
    const ref = makeRegistryRef("researcher", "1.0.0");
    const ops: ReadonlyArray<UpdateOperation> = [{ ref, force: false }];

    const plan = buildUpdatePlan(
      ops,
      trustStateWith("researcher", "1.0.0"),
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
    const ops: ReadonlyArray<UpdateOperation> = [{ ref, force: false }];

    const plan = buildUpdatePlan(
      ops,
      trustStateWith("researcher", "1.0.0"),
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
    const ops: ReadonlyArray<UpdateOperation> = [{ ref, force: true }];

    const plan = buildUpdatePlan(
      ops,
      trustStateWith("researcher", "1.0.0"),
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
      trustStateWith("researcher", undefined),
      "Update subagents",
      Option.none(),
      noopRunClosure,
    );

    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job?.steps).toHaveLength(0);
  });
});
