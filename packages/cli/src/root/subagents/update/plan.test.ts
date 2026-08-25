import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { SubagentsLockMap } from "@agentxm/client-core/unstable/lockfile";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { RegistrySubagentRef } from "@agentxm/client-core/unstable/subagents";
import { TreeIntegritySchema } from "@agentxm/client-core/unstable/extensions";
import * as Schema from "effect/Schema";
import { buildUpdatePlan, type UpdateOperation } from "./plan.js";
import { exactVersion, extensionName, handle } from "../../../test-stubs.js";

const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

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

const acceptedRegistry = (version: string): SubagentsLockMap => ({
  researcher: {
    type: "registry",
    owner: handle("@test"),
    name: extensionName("researcher"),
    resolvedVersion: exactVersion(version),
    integrity: "sha512-AAAA==",
    sourceName: "default",
    publisherBindingId: "hbnd_test",
    treeIntegrity,
  },
});

const noopRunClosure = (_op: UpdateOperation) =>
  Effect.succeed<JobStepResult>({ result: "success", message: "applied" });

const runFirst = (operation: UpdateOperation, locks: SubagentsLockMap) => {
  const plan = buildUpdatePlan(
    [operation],
    locks,
    "Update subagents",
    Option.none(),
    noopRunClosure,
  );
  const step: PlannedJobStep | undefined = plan.jobs[0]?.steps[0];
  if (step === undefined || step.readiness === "error") return Effect.succeed("error");
  return step.run.pipe(Effect.map((result) => result.message));
};

describe("buildUpdatePlan", () => {
  it.effect("skips the same accepted registry version", () =>
    Effect.gen(function* () {
      const message = yield* runFirst(
        { ref: makeRegistryRef("researcher", "1.0.0"), force: false },
        acceptedRegistry("1.0.0"),
      );
      expect(message).toBe("already up to date");
    }),
  );

  it.effect("dispatches changed, forced, and missing resolutions", () =>
    Effect.gen(function* () {
      const changed = yield* runFirst(
        { ref: makeRegistryRef("researcher", "2.0.0"), force: false },
        acceptedRegistry("1.0.0"),
      );
      const forced = yield* runFirst(
        { ref: makeRegistryRef("researcher", "1.0.0"), force: true },
        acceptedRegistry("1.0.0"),
      );
      const missing = yield* runFirst(
        { ref: makeRegistryRef("researcher", "1.0.0"), force: false },
        {},
      );
      expect([changed, forced, missing]).toEqual(["applied", "applied", "applied"]);
    }),
  );

  it("produces one empty unbounded job for empty input", () => {
    const plan = buildUpdatePlan([], {}, "Update subagents", Option.none(), noopRunClosure);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]?.concurrency).toBe("unbounded");
    expect(plan.jobs[0]?.steps).toEqual([]);
  });
});
