import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeFileRegistry } from "@agentxm/registry-client/testing";
import * as Option from "effect/Option";
import { SubagentManager } from "@agentxm/workspace-kernel/materialization";
import {
  buildInstallOperation,
  kernelFailureToStepFailure,
} from "@agentxm/workspace-kernel/reconciliation";
import { ConfiguredAgentOutcomesProviderLive } from "@agentxm/workspace-kernel/reconciliation/live";
import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredSubagent,
} from "@agentxm/workspace-kernel/resolution";
import { writeLocalSubagentPackage } from "../testing/local-packages.js";

import { makeAuthoredExtensionFixture, makeInspectionFixture } from "./testing.js";
import { installRegistryPack, makeInstalledWorkspace } from "./test-support/installed-workspace.js";
import {
  listHooks,
  listPacks,
  listRules,
  listSkills,
  listSubagents,
} from "./type-list/type-lists.js";

export const specification = defineSpecification({
  requirement: "cli/type-lists-report-local-state",
  title: "Type inventories report local extension state",
  statement:
    "When listing skills, subagents, rules, hooks, or packs, AXM shall report the selected type’s current local entries with their management classification, installation state, and source observation, including configured entries that are disabled or absent. Native observations shall distinguish configured consumers from potential readers and report currency only when the native unit has verified ownership and matches the desired content; identical bytes at an unrelated symlink target shall not establish currency.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/skills/list.test.ts",
    "cli/list/reports-the-cross-type-inventory",
    "packages/core/workspace-features/src/inspection/type-list/type-lists.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Type-specific inventory", () => {
  // One authored package of each type the per-type inventories cover. An
  // authored package is configured and physically present, so every row must
  // report the configured lifecycle, an observed installation, and the paths
  // the package occupies.
  const rows = [
    { type: "skill", read: () => listSkills({}) },
    { type: "subagent", read: () => listSubagents({}) },
    { type: "rule", read: () => listRules() },
    { type: "hook", read: () => listHooks() },
    { type: "pack", read: () => listPacks() },
  ] as const;

  for (const row of rows)
    it.effect(row.type, () => {
      const fixture = makeAuthoredExtensionFixture(row.type);
      return fixture
        .provide(
          Effect.gen(function* () {
            const { inventory } = yield* row.read();
            expect(inventory).toMatchObject({
              count: 1,
              configuredCount: 1,
              installedCount: 1,
              items: [
                {
                  name: "example",
                  type: row.type,
                  classification: { kind: "lifecycle", lifecycle: "configured" },
                  installed: true,
                  enabled: true,
                },
              ],
            });
            expect(inventory.items[0]?.paths.length).toBeGreaterThan(0);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  it.effect("keeps a configured but absent disabled skill in the inventory", () => {
    const fixture = makeInspectionFixture({
      settings: { skills: { absent: { source: "@acme/skills/absent", enabled: false } } },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const { inventory } = yield* listSkills({});
          expect(inventory).toMatchObject({
            count: 1,
            configuredCount: 1,
            installedCount: 0,
            items: [{ name: "absent", enabled: false, installed: false }],
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("reports unsupported subagents without claiming a separately authored Skill", () => {
    const workspace = makeInstalledWorkspace({ agents: ["cline"] });
    const source = writeLocalSubagentPackage(workspace.root, { name: "planner" });
    const nativePath = path.join(workspace.root, ".cline", "skills", "planner");
    fs.mkdirSync(nativePath, { recursive: true });
    fs.writeFileSync(path.join(nativePath, "SKILL.md"), "Separately authored Skill.\n");
    return workspace
      .provide(
        Effect.gen(function* () {
          const manager = yield* SubagentManager;
          const resolved = yield* resolveConfiguredSubagent(
            "planner",
            source,
            yield* makeConfiguredReleaseAgeEvaluation(),
          );
          const step = buildInstallOperation(manager, {
            ref: resolved.ref,
            declaration: {
              name: "planner",
              versionRange: Option.map(resolved.versionRange, String),
            },
            toStepFailure: kernelFailureToStepFailure,
          });
          if (step.readiness === "error") throw new Error(step.errorMessage);
          yield* step.run;

          const listed = yield* listSubagents({});
          expect(listed.inventory.items[0]?.agentOutcomes).toMatchObject([
            { agentId: "cline", outcome: "unsupported" },
          ]);
          expect(listed.inventory.items[0]?.nativeLocations ?? []).toEqual([]);
          expect(fs.readFileSync(path.join(nativePath, "SKILL.md"), "utf8")).toBe(
            "Separately authored Skill.\n",
          );
        }).pipe(
          Effect.provide(
            Layer.provideMerge(ConfiguredAgentOutcomesProviderLive, StepFailureConversionTest),
          ),
        ),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  // The owner, version and source below are the installation's, not the
  // fixture's: the pack is published to a Registry on disk and installed
  // through the production pack manager, so a lockfile written by hand could
  // not make this example agree with itself.
  it.effect("reports an accepted Registry pack's owner and version", () => {
    const registry = makeFileRegistry();
    registry.writePack("toolkit", [{ version: "2.3.4", dependencies: {} }]);
    const workspace = makeInstalledWorkspace({ agents: [], sources: [registry.source] });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installRegistryPack({ name: "toolkit", source: "test:@acme/packs/toolkit" });
          const { inventory, rows: packRows } = yield* listPacks();
          expect(inventory.count).toBe(1);
          expect(packRows).toEqual([
            expect.objectContaining({
              name: "toolkit",
              owner: "@acme",
              version: "2.3.4",
              source: "test:@acme/packs/toolkit",
            }),
          ]);
          expect(inventory.items[0]?.installed).toBe(true);
        }),
      )
      .pipe(
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      );
  });
});
