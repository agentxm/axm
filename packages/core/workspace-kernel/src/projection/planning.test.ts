import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import type { DesiredStateGraph } from "../workspace-state/index.js";
import {
  applyProjectionPlans,
  combineObservedProjectionPlans,
  observeObservedPlans,
  observeProjectionPlans,
  planAggregateProjection,
  planSingletonProjection,
  PROJECTION_IO_CONCURRENCY,
  projectionPlanExclusionWarnings,
  unobservedProjectionPlans,
  withObservedProjectionPlans,
  type ObservedProjectionPlans,
} from "./planning.js";
import type { ProjectionUnitObservation } from "./units.js";

const completeGraph: DesiredStateGraph = {
  nodes: [],
  mcpSourceClosures: [],
  problems: [],
  packMembership: [],
};
const incompleteGraph: DesiredStateGraph = {
  nodes: [],
  mcpSourceClosures: [],
  problems: [
    {
      type: "pack-manifest-unavailable",
      pack: "@acme/packs/missing",
      path: "agent_extensions/@acme/packs/missing/pack.json",
      reason: "absent",
    },
  ],
  packMembership: [
    {
      settingsName: "missing",
      pack: "@acme/packs/missing",
      enabled: true,
      declared: { status: "unknown", reason: "absent" },
      routes: "unknown",
    },
  ],
};

describe("shared projection planning", () => {
  it.effect("does not construct aggregate render input from an incomplete graph", () => {
    let selected = false;
    return Effect.gen(function* () {
      const failure = yield* planAggregateProjection({
        unitId: "rule:instructions-region",
        targetFile: "AGENTS.md",
        graph: incompleteGraph,
        select: () => {
          selected = true;
          return Effect.succeed({ contributors: ["partial"], exclusions: [] });
        },
        adapter: {
          apply: () => Effect.void,
          observe: () =>
            Effect.succeed({
              unitId: "rule:instructions-region",
              path: "AGENTS.md#rules",
              present: false,
              current: false,
              expectedContributors: [],
              observedContributors: [],
            }),
        },
      }).pipe(Effect.flip);

      expect(failure._tag).toBe("DesiredStateIncomplete");
      expect(selected).toBe(false);
    });
  });

  it.effect("routes aggregate and singleton sets through the same opaque plan contract", () =>
    Effect.gen(function* () {
      const seen: Array<ReadonlyArray<string>> = [];
      const adapter = {
        apply: (input: { readonly contributors: ReadonlyArray<string> }) =>
          Effect.sync(() => seen.push(input.contributors)),
        observe: () =>
          Effect.succeed({
            unitId: "rule:instructions-region" as const,
            path: "AGENTS.md#rules",
            present: true,
            current: true,
            expectedContributors: [],
            observedContributors: [],
          }),
      };
      const aggregate = yield* planAggregateProjection({
        unitId: "rule:instructions-region",
        targetFile: "AGENTS.md",
        graph: completeGraph,
        select: () => Effect.succeed({ contributors: ["a", "b"], exclusions: [] }),
        adapter,
      });
      const singleton = planSingletonProjection({
        unitId: "skill:agent-skill-directory",
        targetFile: ".claude/skills/a",
        contributor: "a",
        adapter: {
          ...adapter,
          observe: () =>
            Effect.succeed({
              unitId: "skill:agent-skill-directory" as const,
              path: ".claude/skills/a",
              present: true,
              current: true,
              expectedContributors: ["a"],
              observedContributors: ["a"],
            }),
        },
      });

      yield* applyProjectionPlans([aggregate, singleton]);
      expect(seen).toEqual([["a", "b"], ["a"]]);
    }),
  );

  it.effect("carries excluded contributors on the plan, its observation, and its report", () =>
    Effect.gen(function* () {
      const plan = yield* planAggregateProjection({
        unitId: "knowledge:discovery-region",
        targetFile: "/workspace/AGENTS.md",
        graph: completeGraph,
        select: () =>
          Effect.succeed({
            contributors: ["alpha-notes"],
            exclusions: [
              { contributor: "other-notes", reason: "package-missing" as const },
              {
                contributor: "broken-notes",
                reason: "package-invalid" as const,
                detail: "src/index.md requires okf_version: 0.2 in YAML frontmatter.",
              },
            ],
          }),
        adapter: {
          apply: () => Effect.void,
          observe: (input) =>
            Effect.succeed({
              unitId: "knowledge:discovery-region" as const,
              path: "/workspace/AGENTS.md#knowledge",
              present: true,
              current: true,
              expectedContributors: [...input.contributors],
            }),
        },
      });

      const [observation] = yield* observeProjectionPlans([plan]);

      expect(plan.exclusions.map(({ contributor }) => contributor)).toEqual([
        "other-notes",
        "broken-notes",
      ]);
      expect(observation?.exclusions).toEqual(plan.exclusions);
      expect(projectionPlanExclusionWarnings([plan])).toEqual([
        "other-notes was left out of AGENTS.md because its package is missing. Remove it with `axm knowledge uninstall other-notes`, or restore its files and run `axm sync`.",
        "broken-notes was left out of AGENTS.md because its package is invalid: src/index.md requires okf_version: 0.2 in YAML frontmatter. Fix the file and run `axm sync`.",
      ]);
    }),
  );

  it.effect("serializes writes to one target file while allowing independent targets", () => {
    const activeByTarget = new Map<string, number>();
    const maxByTarget = new Map<string, number>();
    let activeOverall = 0;
    let maxOverall = 0;
    const plan = (targetFile: string, contributor: string) =>
      planSingletonProjection({
        unitId: "mcp-server:native-config-entry",
        targetFile,
        contributor,
        adapter: {
          apply: () =>
            Effect.gen(function* () {
              const active = (activeByTarget.get(targetFile) ?? 0) + 1;
              activeByTarget.set(targetFile, active);
              maxByTarget.set(targetFile, Math.max(maxByTarget.get(targetFile) ?? 0, active));
              activeOverall += 1;
              maxOverall = Math.max(maxOverall, activeOverall);
              yield* Effect.sleep("10 millis").pipe(
                Effect.ensuring(
                  Effect.sync(() => {
                    activeByTarget.set(targetFile, (activeByTarget.get(targetFile) ?? 0) - 1);
                    activeOverall -= 1;
                  }),
                ),
              );
            }),
          observe: () =>
            Effect.succeed({
              unitId: "mcp-server:native-config-entry",
              path: targetFile,
              present: true,
              current: true,
              expectedContributors: [contributor],
              observedContributors: [contributor],
            }),
        },
      });

    return Effect.gen(function* () {
      const applying = yield* applyProjectionPlans([
        plan("shared.json", "a"),
        plan("shared.json", "b"),
        plan("other.json", "c"),
      ]).pipe(Effect.forkChild);
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(applying);
      expect(maxByTarget.get("shared.json")).toBe(1);
      expect(maxOverall).toBeGreaterThan(1);
      expect(activeOverall).toBe(0);
    });
  });

  it.effect("bounds observation and application across many independent targets", () => {
    let active = 0;
    let peak = 0;
    const probe = () =>
      Effect.gen(function* () {
        active += 1;
        peak = Math.max(peak, active);
        yield* Effect.sleep("10 millis").pipe(
          Effect.ensuring(
            Effect.sync(() => {
              active -= 1;
            }),
          ),
        );
      });
    const plans = Array.from({ length: PROJECTION_IO_CONCURRENCY * 2 }, (_, index) => {
      const targetFile = `target-${index}.json`;
      return planSingletonProjection({
        unitId: "mcp-server:native-config-entry",
        targetFile,
        contributor: targetFile,
        adapter: {
          apply: () => probe(),
          observe: () =>
            probe().pipe(
              Effect.as({
                unitId: "mcp-server:native-config-entry" as const,
                path: targetFile,
                present: true,
                current: true,
                expectedContributors: [targetFile],
                observedContributors: [targetFile],
              }),
            ),
        },
      });
    });

    return Effect.gen(function* () {
      const observing = yield* observeProjectionPlans(plans).pipe(Effect.forkChild);
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(observing);
      expect(peak).toBe(PROJECTION_IO_CONCURRENCY);
      expect(active).toBe(0);
      peak = 0;
      const applying = yield* applyProjectionPlans(plans).pipe(Effect.forkChild);
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(applying);
      expect(peak).toBe(PROJECTION_IO_CONCURRENCY);
      expect(active).toBe(0);
    });
  });
});

describe("observed projection plans", () => {
  /** A singleton plan that counts its observations and writes; `failing` observations refuse. */
  const countedPlan = (targetFile: string, options: { readonly failing?: boolean } = {}) => {
    const counts = { observed: 0, applied: 0 };
    const plan = planSingletonProjection({
      unitId: "skill:agent-skill-directory",
      targetFile,
      contributor: targetFile,
      adapter: {
        apply: () =>
          Effect.sync(() => {
            counts.applied++;
          }),
        observe: () =>
          Effect.suspend(() => {
            counts.observed++;
            return options.failing === true
              ? Effect.fail(`${targetFile} cannot be realized`)
              : Effect.succeed<ProjectionUnitObservation>({
                  unitId: "skill:agent-skill-directory",
                  path: targetFile,
                  present: true,
                  current: counts.observed === 1,
                  expectedContributors: [targetFile],
                  observedContributors: [targetFile],
                });
          }),
      },
    });
    return { plan, counts };
  };

  it.effect(
    "hands the producer's observation to the first consumer instead of observing again",
    () =>
      Effect.gen(function* () {
        const replanned = countedPlan(".claude/skills/a");
        // The plain pattern: the producer's refusal observes, then the consumer observes again.
        yield* observeProjectionPlans([replanned.plan]);
        yield* observeProjectionPlans([replanned.plan]);
        expect(replanned.counts.observed).toBe(2);

        const handed = countedPlan(".claude/skills/a");
        const observations = yield* withObservedProjectionPlans(
          [handed.plan],
          observeObservedPlans,
        );
        expect(handed.counts.observed).toBe(1);
        expect(observations).toMatchObject([{ path: ".claude/skills/a", current: true }]);
      }),
  );

  it.effect("observes fresh on a second take inside the owner call", () =>
    Effect.gen(function* () {
      const { plan, counts } = countedPlan(".claude/skills/a");
      const [first, second] = yield* withObservedProjectionPlans([plan], (observed) =>
        Effect.all([observeObservedPlans(observed), observeObservedPlans(observed)]),
      );
      expect(counts.observed).toBe(2);
      // The second consumer sees the fresh observation, not the handed one.
      expect(first).toMatchObject([{ current: true }]);
      expect(second).toMatchObject([{ current: false }]);
    }),
  );

  it.effect("observes fresh through a handle retained after the owner call returns", () =>
    Effect.gen(function* () {
      const { plan, counts } = countedPlan(".claude/skills/a");
      const retained = yield* withObservedProjectionPlans([plan], (observed) =>
        Effect.succeed(observed),
      );
      expect(yield* retained.take).toEqual(Option.none());
      expect(yield* observeObservedPlans(retained)).toMatchObject([{ current: false }]);
      expect(counts.observed).toBe(2);
    }),
  );

  it.effect("refuses an invalid later plan before the consumer runs or anything is written", () =>
    Effect.gen(function* () {
      const valid = countedPlan(".claude/skills/a");
      const invalid = countedPlan(".claude/skills/b", { failing: true });
      let used = false;
      const failure = yield* withObservedProjectionPlans([valid.plan, invalid.plan], (observed) =>
        Effect.suspend(() => {
          used = true;
          return applyProjectionPlans(observed.plans);
        }),
      ).pipe(Effect.flip);
      expect(failure).toBe(".claude/skills/b cannot be realized");
      expect(used).toBe(false);
      expect(valid.counts.applied + invalid.counts.applied).toBe(0);
    }),
  );

  it.effect("closes the handle when the consumer is interrupted", () =>
    Effect.gen(function* () {
      const { plan, counts } = countedPlan(".claude/skills/a");
      let handle: ObservedProjectionPlans<string, never> | undefined;
      const exit = yield* withObservedProjectionPlans([plan], (observed) =>
        Effect.suspend(() => {
          handle = observed;
          return Effect.interrupt;
        }).pipe(Effect.andThen(applyProjectionPlans(observed.plans))),
      ).pipe(Effect.exit);
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(handle === undefined ? "absent" : yield* handle.take).toEqual(Option.none());
      expect(counts).toEqual({ observed: 1, applied: 0 });
    }),
  );

  it.effect(
    "combines owners' observations in plan order, observing fresh only a part with none",
    () =>
      Effect.gen(function* () {
        const first = countedPlan(".claude/skills/a");
        const retained = countedPlan(".claude/skills/b");
        const last = countedPlan(".claude/skills/c");
        const observations = yield* withObservedProjectionPlans([first.plan], (firstObserved) =>
          withObservedProjectionPlans([last.plan], (lastObserved) =>
            observeObservedPlans(
              combineObservedProjectionPlans([
                firstObserved,
                unobservedProjectionPlans([retained.plan]),
                lastObserved,
              ]),
            ),
          ),
        );
        expect(observations.map(({ path }) => path)).toEqual([
          ".claude/skills/a",
          ".claude/skills/b",
          ".claude/skills/c",
        ]);
        expect([first.counts.observed, retained.counts.observed, last.counts.observed]).toEqual([
          1, 1, 1,
        ]);
        const unobserved = combineObservedProjectionPlans([
          unobservedProjectionPlans([first.plan]),
        ]);
        expect(yield* unobserved.take).toEqual(Option.none());
        expect(first.counts.observed).toBe(1);
      }),
  );
});
