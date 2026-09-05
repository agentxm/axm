import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleUninstall, handleUninstallPack } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  makePackRetirementWorkspace,
  type PackFixture,
} from "../../support/pack-retirement-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/retires-a-desired-pack-whose-package-is-unreadable",
  title: "Uninstall retires a desired pack whose package cannot be read",
  statement:
    "When uninstall targets a desired pack whose package manifest is missing or cannot be decoded, and every other desired pack is intact, AXM shall remove the pack's configuration and accepted resolution, shall delete no content it could not verify, shall report the removal as registration-only naming the unreadable manifest, and shall reach the same decision in preview and apply; when any other desired pack is incomplete, AXM shall remain blocked and shall change nothing.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A pack's member list is not persisted outside its package manifest; neither axm.json nor axm-lock.yaml carries one, so an unreadable manifest leaves members computable only from the remaining desired state.",
  ],
  openQuestions: [],
});

type Phase = "preview" | "apply";

const runUninstall = (
  fixture: ReturnType<typeof makePackRetirementWorkspace>,
  route: "root" | "packs",
  name: string,
  phase: Phase,
) =>
  (route === "root"
    ? handleUninstall({ source: fixture.fqn(name), yes: true, preview: phase === "preview" })
    : handleUninstallPack({ name }, { yes: true, preview: phase === "preview" })
  ).pipe(Effect.provide(fixture.workspace.layer));

const latestResult = (fixture: ReturnType<typeof makePackRetirementWorkspace>): unknown =>
  fixture.workspace.rendererState.results.at(-1)?.data;

const snapshot = (fixture: ReturnType<typeof makePackRetirementWorkspace>, name: string) => ({
  settings: JSON.stringify(fixture.workspace.readSettings()),
  lockfile: fixture.workspace.readLockfileText(),
  tree: fixture.workspace.snapshotTree(fixture.packDirectory(name)),
});

describe("Uninstall a desired pack whose package cannot be read", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const start = (fixtures: ReadonlyArray<PackFixture>) => {
    const fixture = makePackRetirementWorkspace(fixtures);
    cleanups.push(fixture.workspace.cleanup);
    return fixture;
  };

  const unreadableTargets: ReadonlyArray<{
    readonly label: string;
    readonly target: PackFixture;
  }> = [
    {
      label: "a workspace pack whose manifest was deleted",
      target: { name: "toolkit", authority: "workspace", manifest: "deleted" },
    },
    {
      label: "a registry pack whose manifest was deleted",
      target: { name: "toolkit", authority: "registry", manifest: "deleted" },
    },
    {
      label: "a registry pack whose manifest cannot be decoded",
      target: { name: "toolkit", authority: "registry", manifest: "undecodable" },
    },
  ];

  it.effect.each(unreadableTargets)(
    "removes the registration and preserves the package of $label",
    ({ target }) =>
      Effect.gen(function* () {
        const fixture = start([target]);
        const before = snapshot(fixture, target.name);

        yield* runUninstall(fixture, "packs", target.name, "apply");

        expect(latestResult(fixture)).toMatchObject({ result: { outcome: "applied" } });
        expect(JSON.stringify(fixture.workspace.readSettings())).not.toContain(target.name);
        expect(fixture.workspace.readLockfileText()).not.toContain(target.name);
        // Content whose manifest could not be read is never deleted.
        expect(fixture.workspace.snapshotTree(fixture.packDirectory(target.name))).toEqual(
          before.tree,
        );
        expect(before.settings).toContain(target.name);
      }),
  );

  it.effect.each(unreadableTargets)("reports $label as registration-only", ({ target }) =>
    Effect.gen(function* () {
      const fixture = start([target]);

      yield* runUninstall(fixture, "packs", target.name, "apply");

      const reported = JSON.stringify(latestResult(fixture));
      // No consumer may read the result as a content removal that did not occur.
      expect(reported).toContain(fixture.manifestPath(target.name));
      expect(reported).toContain("left its package content in place");
    }),
  );

  it.effect("reaches the same decision in preview and apply, and previews purely", () =>
    Effect.gen(function* () {
      const target: PackFixture = { name: "toolkit", authority: "workspace", manifest: "deleted" };
      const fixture = start([target]);
      const before = snapshot(fixture, target.name);

      yield* runUninstall(fixture, "packs", target.name, "preview");
      const previewed = latestResult(fixture);
      expect(previewed).toMatchObject({ result: { outcome: "previewed" } });
      expect(JSON.stringify(fixture.workspace.readSettings())).toBe(before.settings);
      expect(fixture.workspace.readLockfileText()).toBe(before.lockfile);

      yield* runUninstall(fixture, "packs", target.name, "apply");
      expect(latestResult(fixture)).toMatchObject({ result: { outcome: "applied" } });
    }),
  );

  it.effect("retires the same pack through the root uninstall route", () =>
    Effect.gen(function* () {
      const target: PackFixture = { name: "toolkit", authority: "workspace", manifest: "deleted" };
      const fixture = start([target]);
      const before = snapshot(fixture, target.name);

      yield* runUninstall(fixture, "root", target.name, "apply");

      expect(latestResult(fixture)).toMatchObject({ result: { outcome: "applied" } });
      expect(JSON.stringify(fixture.workspace.readSettings())).not.toContain(target.name);
      expect(fixture.workspace.snapshotTree(fixture.packDirectory(target.name))).toEqual(
        before.tree,
      );
    }),
  );

  it.effect("is a no-op when the completed retirement is repeated", () =>
    Effect.gen(function* () {
      const target: PackFixture = { name: "toolkit", authority: "workspace", manifest: "deleted" };
      const fixture = start([target]);

      yield* runUninstall(fixture, "packs", target.name, "apply");
      const after = snapshot(fixture, target.name);
      yield* runUninstall(fixture, "packs", target.name, "apply");

      expect(latestResult(fixture)).toMatchObject({ result: { outcome: "no-op" } });
      expect(JSON.stringify(fixture.workspace.readSettings())).toBe(after.settings);
      expect(fixture.workspace.readLockfileText()).toBe(after.lockfile);
    }),
  );

  const blockedCases: ReadonlyArray<{
    readonly label: string;
    readonly fixtures: ReadonlyArray<PackFixture>;
  }> = [
    {
      label: "an intact target beside a pack whose manifest is missing",
      fixtures: [
        { name: "toolkit", authority: "workspace", manifest: "intact" },
        { name: "sibling", authority: "workspace", manifest: "deleted" },
      ],
    },
    {
      label: "an unreadable target beside a pack whose manifest is missing",
      fixtures: [
        { name: "toolkit", authority: "workspace", manifest: "deleted" },
        { name: "sibling", authority: "workspace", manifest: "deleted" },
      ],
    },
    {
      label: "a target whose readable manifest declares another identity",
      fixtures: [{ name: "toolkit", authority: "workspace", manifest: "mismatched" }],
    },
  ];

  it.effect.each(blockedCases)("stays blocked and changes nothing for $label", ({ fixtures }) =>
    Effect.gen(function* () {
      const fixture = start(fixtures);
      const before = snapshot(fixture, "toolkit");

      yield* runUninstall(fixture, "packs", "toolkit", "preview");
      const previewed = latestResult(fixture);
      yield* runUninstall(fixture, "packs", "toolkit", "apply");
      const applied = latestResult(fixture);

      const blocked = {
        result: {
          outcome: "blocked",
          riskConditions: [
            expect.objectContaining({
              level: "blocked",
              id: "packs/uninstall/desired-state-graph-complete",
            }),
          ],
        },
      };
      expect(previewed).toMatchObject(blocked);
      expect(applied).toMatchObject(blocked);
      expect(JSON.stringify(fixture.workspace.readSettings())).toBe(before.settings);
      expect(fixture.workspace.readLockfileText()).toBe(before.lockfile);
      expect(fixture.workspace.snapshotTree(fixture.packDirectory("toolkit"))).toEqual(before.tree);
    }),
  );
});
