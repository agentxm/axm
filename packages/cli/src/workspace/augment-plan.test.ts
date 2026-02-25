import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Operation, Plan } from "./plan.js";
import { augmentPlan, getEffectiveLockfilePolicy } from "./augment-plan.js";

type TestOperationName =
  | "test-op"
  | "install-skill"
  | "install-pack"
  | "install-command"
  | "install-mcp-server";

type TestOp = Operation<TestOperationName, { readonly id: string }> & {
  readonly metadata?: {
    readonly lockfilePolicy:
      | "materialize_if_missing"
      | "read_recover_if_missing"
      | "ignore_if_missing";
  };
};

const makePlan = (operations: ReadonlyArray<TestOp>): Plan<TestOp> => ({
  name: "Test Plan",
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      steps: operations.map((operation) => ({
        _tag: "PlannedJobStep" as const,
        operation,
        readiness: { status: "ready" as const, message: Option.none() },
        label: operation.args.id,
      })),
    },
  ],
});

describe("augmentPlan", () => {
  it.effect("is a no-op for ignore_if_missing plans with missing lockfile", () =>
    Effect.gen(function* () {
      let lockfileProbeCount = 0;
      const plan = makePlan([
        {
          name: "test-op",
          args: { id: "a" },
          metadata: { lockfilePolicy: "ignore_if_missing" },
        },
      ]);

      const result = yield* augmentPlan(plan, {
        getLockfileState: () =>
          Effect.sync(() => {
            lockfileProbeCount += 1;
            return "missing" as const;
          }),
      });

      expect(result.plan).toBe(plan);
      expect(result.diagnostics.warnings).toEqual([]);
      expect(lockfileProbeCount).toBe(1);
    }),
  );

  it.effect("warns when ignore_if_missing sees invalid lockfile", () =>
    Effect.gen(function* () {
      const plan = makePlan([
        {
          name: "test-op",
          args: { id: "a" },
          metadata: { lockfilePolicy: "ignore_if_missing" },
        },
      ]);

      const result = yield* augmentPlan(plan, {
        getLockfileState: () => Effect.succeed("invalid" as const),
      });

      expect(result.plan).toBe(plan);
      expect(result.diagnostics.warnings).toEqual(["LOCKFILE_INVALID_IGNORED"]);
    }),
  );

  it.effect("injects read-recover and materialize for materialize policy + missing lockfile", () =>
    Effect.gen(function* () {
      const plan = makePlan([
        {
          name: "test-op",
          args: { id: "a" },
          metadata: { lockfilePolicy: "materialize_if_missing" },
        },
      ]);

      const result = yield* augmentPlan(plan, {
        getLockfileState: () => Effect.succeed("missing" as const),
      });

      expect(result.plan.jobs).toHaveLength(2);
      const firstJob = result.plan.jobs[0]!;
      expect(firstJob.steps).toHaveLength(2);
      expect(firstJob.steps[0]).toMatchObject({
        _tag: "PlannedJobStep",
        operation: {
          name: "read-recover-lockfile",
          args: { reason: "missing", origin: "augmentPlan" },
        },
      });
      expect(firstJob.steps[1]).toMatchObject({
        _tag: "PlannedJobStep",
        operation: {
          name: "reconcile-materialize-lockfile",
          args: { reason: "missing", origin: "augmentPlan" },
        },
      });
    }),
  );

  it.effect("injects read-recover only for read_recover policy + invalid lockfile", () =>
    Effect.gen(function* () {
      const plan = makePlan([
        {
          name: "test-op",
          args: { id: "a" },
          metadata: { lockfilePolicy: "read_recover_if_missing" },
        },
      ]);

      const result = yield* augmentPlan(plan, {
        getLockfileState: () => Effect.succeed("invalid" as const),
      });

      expect(result.plan.jobs).toHaveLength(2);
      const firstJob = result.plan.jobs[0]!;
      expect(firstJob.steps).toHaveLength(1);
      expect(firstJob.steps[0]).toMatchObject({
        _tag: "PlannedJobStep",
        operation: {
          name: "read-recover-lockfile",
          args: { reason: "invalid", origin: "augmentPlan" },
        },
      });
      expect(result.diagnostics.warnings).toEqual(["LOCKFILE_INVALID_RECONCILE"]);
    }),
  );

  it.effect("does not re-augment plans already tagged by augmentPlan", () =>
    Effect.gen(function* () {
      const alreadyAugmented: Plan<TestOp> = {
        ...makePlan([
          {
            name: "test-op",
            args: { id: "a" },
            metadata: { lockfilePolicy: "materialize_if_missing" },
          },
        ]),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                _tag: "PlannedJobStep",
                operation: {
                  name: "read-recover-lockfile",
                  args: { reason: "missing", origin: "augmentPlan" },
                } as unknown as TestOp,
                readiness: { status: "ready", message: Option.none() },
                label: "[auto] read-recover lockfile (missing)",
              },
            ],
          },
        ],
      };

      const result = yield* augmentPlan(alreadyAugmented, {
        getLockfileState: () => Effect.succeed("missing" as const),
      });

      expect(result.plan).toBe(alreadyAugmented);
    }),
  );

  it("uses policy precedence materialize > read_recover > ignore", () => {
    const plan = makePlan([
      {
        name: "test-op",
        args: { id: "a" },
        metadata: { lockfilePolicy: "ignore_if_missing" },
      },
      {
        name: "test-op",
        args: { id: "b" },
        metadata: { lockfilePolicy: "read_recover_if_missing" },
      },
      {
        name: "test-op",
        args: { id: "c" },
        metadata: { lockfilePolicy: "materialize_if_missing" },
      },
    ]);

    expect(getEffectiveLockfilePolicy(plan)).toBe("materialize_if_missing");
  });

  it.effect("augments skills/packs/commands/mcp install plans on missing lockfile", () =>
    Effect.gen(function* () {
      const installOps = [
        "install-skill",
        "install-pack",
        "install-command",
        "install-mcp-server",
      ] as const;

      for (const operationName of installOps) {
        const plan = makePlan([
          {
            name: operationName,
            args: { id: operationName },
          },
        ]);

        const result = yield* augmentPlan(plan, {
          getLockfileState: () => Effect.succeed("missing" as const),
        });

        expect(result.plan.jobs).toHaveLength(2);
        expect(result.plan.jobs[0]?.steps[0]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: {
            name: "read-recover-lockfile",
            args: { reason: "missing", origin: "augmentPlan" },
          },
        });
        expect(result.plan.jobs[0]?.steps[1]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: {
            name: "reconcile-materialize-lockfile",
            args: { reason: "missing", origin: "augmentPlan" },
          },
        });
        expect(result.plan.jobs[1]?.steps[0]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: { name: operationName },
        });
      }
    }),
  );

  it.effect("augments skills/packs/commands/mcp install plans on invalid lockfile", () =>
    Effect.gen(function* () {
      const installOps = [
        "install-skill",
        "install-pack",
        "install-command",
        "install-mcp-server",
      ] as const;

      for (const operationName of installOps) {
        const plan = makePlan([
          {
            name: operationName,
            args: { id: operationName },
          },
        ]);

        const result = yield* augmentPlan(plan, {
          getLockfileState: () => Effect.succeed("invalid" as const),
        });

        expect(result.plan.jobs).toHaveLength(2);
        expect(result.plan.jobs[0]?.steps[0]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: {
            name: "read-recover-lockfile",
            args: { reason: "invalid", origin: "augmentPlan" },
          },
        });
        expect(result.plan.jobs[0]?.steps[1]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: {
            name: "reconcile-materialize-lockfile",
            args: { reason: "invalid", origin: "augmentPlan" },
          },
        });
        expect(result.plan.jobs[1]?.steps[0]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: { name: operationName },
        });
        expect(result.diagnostics.warnings).toEqual(["LOCKFILE_INVALID_RECONCILE"]);
      }
    }),
  );

  it.effect("leaves skills/packs/commands/mcp install plans unchanged on ok lockfile", () =>
    Effect.gen(function* () {
      const installOps = [
        "install-skill",
        "install-pack",
        "install-command",
        "install-mcp-server",
      ] as const;

      for (const operationName of installOps) {
        const plan = makePlan([
          {
            name: operationName,
            args: { id: operationName },
          },
        ]);

        const result = yield* augmentPlan(plan, {
          getLockfileState: () => Effect.succeed("ok" as const),
        });

        expect(result.plan).toBe(plan);
        expect(result.plan.jobs[0]?.steps[0]).toMatchObject({
          _tag: "PlannedJobStep",
          operation: { name: operationName },
        });
      }
    }),
  );
});
