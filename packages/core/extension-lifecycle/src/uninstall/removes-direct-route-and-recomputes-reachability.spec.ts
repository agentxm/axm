import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { applyActivation } from "../activation/test-helpers.js";

import {
  applyInstall,
  contentUnder,
  installRequest,
  localLifecycleRows,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "../install/test-helpers.js";
import { writeLocalSkillPackage } from "../testing.js";
import { applyUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/removes-direct-route-and-recomputes-reachability",
  title: "Uninstall removes direct intent and keeps state another desired route still reaches",
  statement:
    "When a directly desired extension is uninstalled, AXM shall remove its direct configuration, remove its resolution and verified acquired content when no other desired route reaches it, realize activation and owned outputs from the remaining desired routes, report retained state, preserve authored inventory, and leave state outside the necessary dependency and shared-output closure untouched.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle"],
  supersedes: ["cli/every-type-completes-the-shared-lifecycle"],
  assumptions: [],
  openQuestions: [],
});

describe("Uninstall a directly desired extension", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("removing a disabled direct preference restores an enabled Pack route", () => {
    const { workspace, registry } = world();
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
    registry.writePack("reviews", [
      { version: "1.0.0", dependencies: { "@acme/skills/review": "^1.0.0" } },
    ]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: "@acme/packs/reviews" },
            }),
          );
          yield* applyActivation({ type: "skill", name: "review", enabled: false });
          expect(workspace.exists(".claude/skills/review")).toBe(false);
          const result = yield* applyUninstall(
            uninstallRequest({ selector: "@acme/skills/review" }),
          );
          expect(deriveOperationOutcome(result)).toBe("applied");
          const graph = yield* (yield* WorkspaceMutations).getDesiredStateGraph();
          expect(
            graph.nodes.find((node) => node.type === "skill" && node.name === "review")?.enabled,
          ).toBe(true);
          expect(workspace.exists(".claude/skills/review/SKILL.md")).toBe(true);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  /** Acquire a skill from a local directory, the way a person points at one. */
  const installLocalSkill = (world: InstallWorld, name: string) =>
    applyInstall(
      installRequest({
        type: "skill",
        subject: {
          kind: "source",
          source: writeLocalSkillPackage(world.workspace.root, { name }),
        },
      }),
    );

  it.effect("removes the direct workspace configuration route and its resolution", () => {
    const created = world();
    const { workspace } = created;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installLocalSkill(created, "code-review");

          yield* applyUninstall(uninstallRequest({ selector: "@acme/skills/code-review" }));

          expect(JSON.stringify(readSettings(workspace))).not.toContain("code-review");
          expect(workspace.readFile("axm-lock.yaml")).not.toContain("code-review");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("removes canonical content and agent projections nothing else desires", () => {
    const created = world();
    const { workspace } = created;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installLocalSkill(created, "code-review");
          expect(workspace.exists("agent_extensions/local/vendor/code-review/src/SKILL.md")).toBe(
            true,
          );

          yield* applyUninstall(uninstallRequest({ selector: "@acme/skills/code-review" }));

          expect(workspace.exists("agent_extensions/local/vendor/code-review")).toBe(false);
          expect(workspace.exists(".claude/skills/code-review")).toBe(false);
          expect(workspace.exists(".agents/skills/code-review")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves other desired extensions and their realized state", () => {
    const created = world();
    const { workspace } = created;
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installLocalSkill(created, "code-review");
          yield* installLocalSkill(created, "release-notes");
          const projectedBefore = workspace.readFile(".claude/skills/release-notes/SKILL.md");

          yield* applyUninstall(uninstallRequest({ selector: "@acme/skills/code-review" }));

          expect(readSettings(workspace)).toMatchObject({
            skills: { "release-notes": "./vendor/release-notes" },
          });
          expect(workspace.readFile("axm-lock.yaml")).toContain("release-notes");
          expect(workspace.readFile(".claude/skills/release-notes/SKILL.md")).toBe(projectedBefore);
          expect(workspace.exists("agent_extensions/local/vendor/release-notes/src/SKILL.md")).toBe(
            true,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "keeps the resolution, canonical content, and projection of a pack-reached extension",
    () => {
      const created = world();
      const { workspace, registry } = created;
      // The same skill is desired twice over: directly, and as a member the
      // installed pack declares.
      registry.writeSkill("review-helper", [{ version: "1.0.0", body: "Review guidance." }]);
      registry.writePack("review-pack", [
        { version: "1.0.0", dependencies: { "@acme/skills/review-helper": "^1.0.0" } },
      ]);
      const canonical = "agent_extensions/agentxm/@acme/skills/review-helper";
      const projection = ".claude/skills/review-helper";
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "skill",
                subject: { kind: "source", source: "@acme/skills/review-helper" },
              }),
            );
            yield* applyInstall(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "@acme/packs/review-pack" },
              }),
            );
            expect(readSettings(workspace)).toMatchObject({
              skills: { "review-helper": "agentxm:@acme/skills/review-helper" },
              packs: { "review-pack": "agentxm:@acme/packs/review-pack" },
            });
            const canonicalBefore = contentUnder(workspace, canonical);
            const projectedBefore = contentUnder(workspace, projection);
            const lockBefore = workspace.readFile("axm-lock.yaml");

            const resolution = yield* applyUninstall(
              uninstallRequest({ selector: "@acme/skills/review-helper" }),
            );

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            const settingsText = JSON.stringify(readSettings(workspace));
            expect(settingsText).not.toContain("skills/review-helper");
            expect(settingsText).toContain("review-pack");
            // The pack still reaches the skill, so its resolution, canonical
            // content, and projection all survive the direct route's removal.
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
            expect(contentUnder(workspace, canonical)).toEqual(canonicalBefore);
            expect(contentUnder(workspace, projection)).toEqual(projectedBefore);
            expect(canonicalBefore.length).toBeGreaterThan(0);
            expect(projectedBefore.length).toBeGreaterThan(0);
            // The removal reports the retention rather than claiming a deletion.
            const [unit] = resolution.units;
            expect(unit?.artifact?.references).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  state: "retained",
                  reason: "required by resulting desired state",
                }),
              ]),
            );
            expect(unit?.message).toContain("retained its package");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(localLifecycleRows)("removes the unneeded $label footprint", (row) => {
    const created = world();
    const { workspace } = created;
    const name = `conformance-${row.label}`;
    const source = row.writePackage(workspace.root, { name });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: row.type, subject: { kind: "source", source } }),
          );
          expect(
            workspace.exists(`agent_extensions/local/vendor/${name}/${row.canonicalFile(name)}`),
          ).toBe(true);

          yield* applyUninstall(uninstallRequest({ selector: `@acme/${row.plural}/${name}` }));

          expect(readSettings(workspace)).not.toMatchObject({
            [row.settingsKey]: { [name]: expect.anything() },
          });
          expect(workspace.readFile("axm-lock.yaml")).not.toContain(name);
          expect(workspace.exists(`agent_extensions/local/vendor/${name}`)).toBe(false);
          row.expectUnrealized(workspace, name);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
