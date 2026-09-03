import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { DesiredStateGraph } from "@agentxm/workspace-state";
import {
  applyProjectionPlans,
  observeProjectionPlans,
  planAggregateProjection,
  planSingletonProjection,
  projectionPlanExclusionWarnings,
} from "./planning.js";

const completeGraph: DesiredStateGraph = {
  complete: true,
  nodes: [],
  mcpSourceClosures: [],
  problems: [],
};
const incompleteGraph: DesiredStateGraph = {
  complete: false,
  nodes: [],
  mcpSourceClosures: [],
  problems: [
    {
      type: "pack-manifest-unavailable",
      pack: "@acme/packs/missing",
      path: "agent_extensions/@acme/packs/missing/pack.json",
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
            Effect.promise(
              () =>
                new Promise<void>((resolve) => {
                  const active = (activeByTarget.get(targetFile) ?? 0) + 1;
                  activeByTarget.set(targetFile, active);
                  maxByTarget.set(targetFile, Math.max(maxByTarget.get(targetFile) ?? 0, active));
                  activeOverall += 1;
                  maxOverall = Math.max(maxOverall, activeOverall);
                  setTimeout(() => {
                    activeByTarget.set(targetFile, active - 1);
                    activeOverall -= 1;
                    resolve();
                  }, 10);
                }),
            ),
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
      yield* applyProjectionPlans([
        plan("shared.json", "a"),
        plan("shared.json", "b"),
        plan("other.json", "c"),
      ]);
      expect(maxByTarget.get("shared.json")).toBe(1);
      expect(maxOverall).toBeGreaterThan(1);
    });
  });
});
