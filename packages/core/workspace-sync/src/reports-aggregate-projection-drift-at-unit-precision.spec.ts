import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { ResolvedUnit } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  writeAuthoredKnowledge,
  writeAuthoredRule,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/reports-aggregate-projection-drift-at-unit-precision",
  title: "Sync identifies the shared output that needs updating",
  statement:
    "When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "machine-automation", "workspace-intent-fidelity"],
  methods: ["decision-table", "contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const requireUnit = (
  units: ReadonlyArray<ResolvedUnit<void>>,
  unitId: string,
): ResolvedUnit<void> => {
  const unit = units.find(({ id }) => id === unitId);
  if (unit === undefined) throw new Error(`Expected sync unit ${unitId}`);
  return unit;
};

const expectNoContributorAttribution = (
  unit: ResolvedUnit<void>,
  contributors: ReadonlyArray<string>,
): void => {
  const diagnostic = `${unit.label}\n${unit.message ?? ""}`;
  for (const contributor of contributors) expect(diagnostic).not.toContain(contributor);
};

describe("Aggregate projection drift diagnostics", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fixture = (settings: Readonly<Record<string, unknown>>): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: [],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        ...settings,
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("reports stale and missing Rules regions without inferring a contributor cause", () => {
    const workspace = fixture({ rules: { alpha: "workspace", beta: "workspace" } });
    writeAuthoredRule(workspace.root, "alpha", "First alpha guidance.");
    writeAuthoredRule(workspace.root, "beta", "Stable beta guidance.");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          writeAuthoredRule(workspace.root, "alpha", "Changed alpha guidance.");
          const stale = expectResolved(yield* previewSync());
          const staleUnit = requireUnit(stale.units, "instruction:reconcile");
          expect(staleUnit).toMatchObject({
            label: "instruction files (stale)",
            state: "ready",
            artifact: {
              path: "AGENTS.md",
              change: "updated",
              managedRegions: [
                {
                  unitId: "rule:instructions-region",
                  path: "AGENTS.md#rules",
                  owner: "@agentxm/rules/instructions",
                },
              ],
            },
          });
          expectNoContributorAttribution(staleUnit, ["@acme/rules/alpha", "@acme/rules/beta"]);

          yield* applySync();
          workspace.remove("AGENTS.md");
          const missing = expectResolved(yield* previewSync());
          const missingUnit = requireUnit(missing.units, "instruction:reconcile");
          expect(missingUnit.label).toBe("instruction files (missing)");
          expect(missingUnit.artifact).toMatchObject({ path: "AGENTS.md", change: "updated" });
          expectNoContributorAttribution(missingUnit, ["@acme/rules/alpha", "@acme/rules/beta"]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports stale Knowledge discovery at its managed-unit boundary", () => {
    const workspace = fixture({ knowledge: { alpha: "workspace", beta: "workspace" } });
    writeAuthoredKnowledge(workspace.root, "alpha", "Initial alpha knowledge.");
    writeAuthoredKnowledge(workspace.root, "beta", "Stable beta knowledge.");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          writeAuthoredKnowledge(workspace.root, "alpha", "Changed alpha knowledge.");
          const resolution = expectResolved(yield* previewSync());
          const unit = requireUnit(resolution.units, "knowledge:discovery");
          expect(unit).toMatchObject({
            label: "Knowledge discovery (stale)",
            state: "ready",
            artifact: { path: "AGENTS.md", change: "updated" },
          });
          expect(unit.artifact?.managedRegions).toHaveLength(1);
          expect(unit.artifact?.managedRegions?.[0]).toMatchObject({
            unitId: "knowledge:discovery-region",
            owner: "@agentxm/knowledge/discovery",
          });
          expect(unit.artifact?.managedRegions?.[0]?.path.endsWith("/AGENTS.md#knowledge")).toBe(
            true,
          );
          expectNoContributorAttribution(unit, ["@acme/knowledge/alpha", "@acme/knowledge/beta"]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
