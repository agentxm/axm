import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { ResolvedUnit } from "../../transitions/planning/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  syncRequest,
  writeAuthoredKnowledge,
  writeAuthoredRule,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/reports-aggregate-projection-drift-at-unit-precision",
  title: "Sync identifies the shared output that needs updating",
  statement:
    "When an aggregate projection like an instruction file's rules or knowledge region drifts, a sync preview for the whole workspace, for one contributing extension, or for the contributors' type shall report it as stale or missing at the owning managed unit and region, and shall not attribute the cause to any individual contributing extension; applying that selection shall regenerate the whole region from every contributor, and when another contributor lacks accepted state the region shall stay blocked and unchanged.",
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

  const aggregates = [
    {
      type: "rule",
      settingsKey: "rules",
      alpha: "@acme/rules/alpha",
      beta: "@acme/rules/beta",
      unitId: "instruction:reconcile",
      label: "instruction files (stale)",
      write: writeAuthoredRule,
    },
    {
      type: "knowledge",
      settingsKey: "knowledge",
      alpha: "@acme/knowledge/alpha",
      beta: "@acme/knowledge/beta",
      unitId: "knowledge:discovery",
      label: "Knowledge discovery (stale)",
      write: writeAuthoredKnowledge,
    },
  ] as const;

  for (const aggregate of aggregates) {
    const contributors = [aggregate.alpha, aggregate.beta];
    const selections = [
      { name: "one contributor", request: syncRequest({ target: Option.some(aggregate.alpha) }) },
      {
        name: "the contributors' type",
        request: syncRequest({ type: Option.some(aggregate.type) }),
      },
    ];
    for (const selection of selections) {
      it.effect(
        `reconciles the whole ${aggregate.type} region when sync selects ${selection.name}`,
        () => {
          const workspace = fixture({
            [aggregate.settingsKey]: { alpha: "workspace", beta: "workspace" },
          });
          aggregate.write(workspace.root, "alpha", "Initial alpha content.");
          aggregate.write(workspace.root, "beta", "Stable beta content.");
          return workspace
            .provide(
              Effect.gen(function* () {
                yield* applySync();
                const unchanged = yield* previewSync(selection.request);
                expect(unchanged._tag).toBe("AlreadyReconciled");

                aggregate.write(workspace.root, "alpha", "Changed alpha content.");
                const before = workspace.readFile("AGENTS.md");
                const resolution = expectResolved(yield* previewSync(selection.request));
                const unit = requireUnit(resolution.units, aggregate.unitId);
                expect(unit).toMatchObject({
                  label: aggregate.label,
                  state: "ready",
                  artifact: { path: "AGENTS.md", change: "updated" },
                });
                expectNoContributorAttribution(unit, contributors);
                expect(workspace.readFile("AGENTS.md")).toBe(before);

                yield* applySync(selection.request);
                const after = workspace.readFile("AGENTS.md");
                expect(after).toContain("Changed alpha content.");
                expect(after).toContain("Stable beta content.");
                expect((yield* previewSync(selection.request))._tag).toBe("AlreadyReconciled");
                expect((yield* previewSync())._tag).toBe("AlreadyReconciled");
              }),
            )
            .pipe(Effect.provide(NodeServices.layer));
        },
      );
    }
  }

  it.effect(
    "keeps Knowledge discovery blocked while another contributor lacks accepted state",
    () => {
      const workspace = fixture({ knowledge: { alpha: "workspace", beta: "workspace" } });
      writeAuthoredKnowledge(workspace.root, "alpha", "Initial alpha knowledge.");
      writeAuthoredKnowledge(workspace.root, "beta", "Stable beta knowledge.");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            workspace.writeFile(
              "axm.json",
              `${JSON.stringify({
                owner: "@acme",
                agents: [],
                instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
                knowledge: { alpha: "workspace", beta: "./missing-beta" },
              })}\n`,
            );
            writeAuthoredKnowledge(workspace.root, "alpha", "Changed alpha knowledge.");
            const before = workspace.readFile("AGENTS.md");
            const request = syncRequest({ target: Option.some("@acme/knowledge/alpha") });

            const preview = expectResolved(yield* previewSync(request));
            expect(requireUnit(preview.units, "knowledge:discovery").state).toBe("blocked");
            const applied = expectResolved(yield* applySync(request));
            expect(requireUnit(applied.units, "knowledge:discovery").state).toBe("blocked");
            expect(workspace.readFile("AGENTS.md")).toBe(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
