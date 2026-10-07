import { fileRegistryPackagePath } from "../../testing/install-world.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  deriveOperationOutcome,
  operationNativeLocations,
} from "@agentxm/workspace-kernel/operations";
import { SkillManager } from "@agentxm/workspace-kernel/materialization";
import { SkillMaterializationFailed } from "@agentxm/extension-kinds/skills";
import { defineSpecification } from "@agentxm/specification-metadata";
import { DesiredStateReader, SettingsWriter } from "@agentxm/workspace-kernel/workspace-state";
import { applyActivation } from "../activation/test-helpers.js";

import { contentUnder, localLifecycleRows, readSettings } from "../install/test-helpers.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { applyUninstall, previewUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/removes-direct-route-and-recomputes-reachability",
  title: "Uninstall removes direct intent and keeps state another desired route still reaches",
  statement:
    "When a directly desired extension is uninstalled, AXM shall remove its direct acquisition declaration while retaining MCP distribution and input preferences for connections still reached through a Pack, remove its resolution and verified acquired content when no other desired route reaches it, realize activation and owned outputs from the remaining desired routes, report retained state, preserve authored inventory, refuse and roll back when final owner readback finds a required retained native unit changed, and leave state outside the necessary dependency and shared-output closure untouched.",
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

  it.effect(
    "retains a configured Pack member's MCP selection when its direct route is removed",
    () => {
      const created = makeInstallWorld({
        settings: { packs: { toolkit: "test:@acme/packs/toolkit" } },
      });
      cleanups.push(created.cleanup);
      const { workspace, registry } = created;
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      registry.writePack("toolkit", [
        { version: "1.0.0", dependencies: { "@acme/mcps/context": "^1.0.0" } },
      ]);
      return workspace
        .provide(
          Effect.gen(function* () {
            const configured = yield* applyInstall(
              installRequest({ subject: { kind: "configured" } }),
            );
            expect(deriveOperationOutcome(configured), JSON.stringify(configured)).toBe("applied");
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "@acme/mcps/context" },
              }),
            );
            const nativeBefore = workspace.readFile(".mcp.json");
            const result = yield* applyUninstall(
              uninstallRequest({ selector: "@acme/mcps/context" }),
            );
            expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe("applied");
            expect(readSettings(workspace)).toMatchObject({
              mcpServers: { context: { distribution: expect.anything() } },
            });
            expect(JSON.stringify(readSettings(workspace))).not.toContain(
              '"source":"test:@acme/mcps/context"',
            );
            expect(workspace.readFile(".mcp.json")).toBe(nativeBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

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
          const graph = yield* (yield* DesiredStateReader).graph();
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

  const nativeLayouts = [
    "claude-to-shared",
    "shared-to-claude",
    "deep-parent-aliases",
    "independent",
  ] as const;
  const prepareNativeSkill = (created: InstallWorld, layout: (typeof nativeLayouts)[number]) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = created.workspace.root;
      const claude = path.join(root, ".claude", "skills");
      const shared = path.join(root, ".agents", "skills");
      const links: Array<{ readonly path: string; readonly text: string }> = [];
      yield* fs.makeDirectory(path.dirname(claude), { recursive: true });
      yield* fs.makeDirectory(path.dirname(shared), { recursive: true });
      if (layout === "independent") {
        yield* fs.makeDirectory(claude);
        yield* fs.makeDirectory(shared);
      } else if (layout === "deep-parent-aliases") {
        const target = path.join(root, "native", "nested", "skills");
        yield* fs.makeDirectory(target, { recursive: true });
        for (const alias of [claude, shared]) {
          const text = path.relative(path.dirname(alias), target);
          yield* fs.symlink(text, alias);
          links.push({ path: alias, text });
        }
      } else {
        const target = layout === "claude-to-shared" ? shared : claude;
        const alias = layout === "claude-to-shared" ? claude : shared;
        yield* fs.makeDirectory(target);
        const text = path.relative(path.dirname(alias), target);
        yield* fs.symlink(text, alias);
        links.push({ path: alias, text });
      }
      yield* fs.writeFileString(
        path.join(claude, "foreign.txt"),
        "Preserve unrelated native bytes\n",
      );
      yield* installLocalSkill(created, "alias-review");
      const authored = path.join(root, "vendor", "alias-review", "src", "SKILL.md");
      const body = yield* fs.readFileString(authored);
      const entries = [path.join(claude, "alias-review"), path.join(shared, "alias-review")];
      for (const entry of entries)
        expect(yield* fs.readFileString(path.join(entry, "SKILL.md"))).toBe(body);
      return {
        fs,
        path,
        links,
        authored,
        body,
        entries,
        expectedUnits: layout === "independent" ? 2 : 1,
      };
    });

  it.effect.each(nativeLayouts)(
    "previews and removes native Skill entries once with %s",
    (layout) => {
      const created = world();
      const { workspace } = created;
      return workspace
        .provide(
          Effect.gen(function* () {
            const fixture = yield* prepareNativeSkill(created, layout);
            const request = uninstallRequest({ selector: "@acme/skills/alias-review" });
            const before = workspace.snapshot();
            const preview = yield* previewUninstall(request);
            expect(deriveOperationOutcome(preview)).toBe("previewed");
            expect(workspace.snapshot()).toEqual(before);
            const proposed = operationNativeLocations(preview).filter(
              (unit) => fixture.path.basename(unit.address.path) === "alias-review",
            );
            expect(proposed).toHaveLength(fixture.expectedUnits);
            const result = yield* applyUninstall(request);
            expect(deriveOperationOutcome(result)).toBe("applied");
            const removed = operationNativeLocations(result).filter(
              (unit) => fixture.path.basename(unit.address.path) === "alias-review",
            );
            expect(removed).toHaveLength(fixture.expectedUnits);
            expect(removed.every((unit) => unit.state === "removed")).toBe(true);
            for (const entry of fixture.entries)
              expect(yield* fixture.fs.exists(entry)).toBe(false);
            for (const link of fixture.links)
              expect(yield* fixture.fs.readLink(link.path)).toBe(link.text);
            expect(yield* fixture.fs.readFileString(fixture.authored)).toBe(fixture.body);
            expect(workspace.readFile(".claude/skills/foreign.txt")).toBe(
              "Preserve unrelated native bytes\n",
            );
            expect(workspace.exists("agent_extensions/_local/project/vendor/alias-review")).toBe(
              false,
            );
            expect(JSON.stringify(readSettings(workspace))).not.toContain("alias-review");
            expect(workspace.readFile("axm-lock.yaml")).not.toContain("alias-review");
            const after = workspace.snapshot();
            expect(deriveOperationOutcome(yield* applyUninstall(request))).toBe("no-op");
            expect(workspace.snapshot()).toEqual(after);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(nativeLayouts)(
    "restores a failed Skill uninstall after native retirement with %s",
    (layout) => {
      const created = world();
      const { workspace } = created;
      return workspace
        .provide(
          Effect.gen(function* () {
            const fixture = yield* prepareNativeSkill(created, layout);
            const before = workspace.snapshot();
            const manager = yield* SkillManager;
            const retired = yield* Ref.make(0);
            const result = yield* applyUninstall(
              uninstallRequest({ selector: "@acme/skills/alias-review" }),
            ).pipe(
              Effect.provideService(SkillManager, {
                ...manager,
                materializeUninstall: (request) =>
                  manager.materializeUninstall(request).pipe(
                    Effect.andThen(
                      Effect.gen(function* () {
                        for (const entry of fixture.entries) {
                          const exists = yield* fixture.fs.exists(entry).pipe(
                            Effect.mapError(
                              (cause) =>
                                new SkillMaterializationFailed({
                                  detail: "Cannot inspect the injected retirement boundary",
                                  cause,
                                }),
                            ),
                          );
                          expect(exists).toBe(false);
                        }
                        expect(
                          workspace.exists("agent_extensions/_local/project/vendor/alias-review"),
                        ).toBe(false);
                        yield* Ref.update(retired, (count) => count + 1);
                        return yield* new SkillMaterializationFailed({
                          detail: "Injected failure after native retirement",
                          cause: "uninstall restoration control",
                        });
                      }),
                    ),
                  ),
              }),
            );
            expect(yield* Ref.get(retired)).toBe(1);
            expect(deriveOperationOutcome(result)).toBe("failed");
            expect(result.units.some((unit) => unit.disposition === "restored")).toBe(true);
            expect(
              result.units.some(
                (unit) => unit.disposition === "retained" || unit.disposition === "unknown",
              ),
            ).toBe(false);
            expect(workspace.snapshot()).toEqual(before);
            for (const entry of fixture.entries)
              expect(yield* fixture.fs.readFileString(fixture.path.join(entry, "SKILL.md"))).toBe(
                fixture.body,
              );
            for (const link of fixture.links)
              expect(yield* fixture.fs.readLink(link.path)).toBe(link.text);
            expect(yield* fixture.fs.readFileString(fixture.authored)).toBe(fixture.body);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
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
          expect(
            workspace.exists("agent_extensions/_local/project/vendor/code-review/src/SKILL.md"),
          ).toBe(true);

          yield* applyUninstall(uninstallRequest({ selector: "@acme/skills/code-review" }));

          expect(workspace.exists("agent_extensions/_local/project/vendor/code-review")).toBe(
            false,
          );
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
          expect(
            workspace.exists("agent_extensions/_local/project/vendor/release-notes/src/SKILL.md"),
          ).toBe(true);
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
      const canonical = fileRegistryPackagePath(registry, "skills", "review-helper");
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
              skills: { "review-helper": "test:@acme/skills/review-helper" },
              packs: { "review-pack": "test:@acme/packs/review-pack" },
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

  it.effect.each(["pack", "subagent"] as const)(
    "preserves a preexisting opaque body rewrite when withdrawing its %s route",
    (type) => {
      const { workspace, registry } = world();
      registry.writeSubagent("planner", [{ version: "1.0.0", body: "Plan carefully." }]);
      registry.writePack("planning", [
        { version: "1.0.0", dependencies: { "@acme/subagents/planner": "^1.0.0" } },
      ]);
      return workspace
        .provide(
          Effect.gen(function* () {
            for (const [kind, source] of [
              ["subagent", "@acme/subagents/planner"],
              ["pack", "@acme/packs/planning"],
            ] as const) {
              const installed = yield* applyInstall(
                installRequest({ type: kind, subject: { kind: "source", source } }),
              );
              expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
            }
            const nativePath = ".claude/agents/planner.md";
            const generated = workspace.readFile(nativePath);
            const rewritten = generated.replace(
              "Plan carefully.",
              "Repository-formatted planning body.",
            );
            expect(rewritten).not.toBe(generated);
            workspace.writeFile(nativePath, rewritten);
            const removed = yield* applyUninstall(
              uninstallRequest({ type, selector: type === "pack" ? "planning" : "planner" }),
            );
            expect(deriveOperationOutcome(removed), JSON.stringify(removed)).toBe("applied");
            expect(workspace.readFile(nativePath)).toBe(rewritten);
            const graph = yield* (yield* DesiredStateReader).graph();
            expect(
              graph.nodes.some(
                (node) => node.type === "subagent" && node.name === "planner" && node.enabled,
              ),
            ).toBe(true);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(["body", "ownership marker"] as const)(
    "rolls back Pack withdrawal when a retained member's %s changes",
    (change) => {
      const { workspace, registry } = world();
      registry.writeSubagent("planner", [{ version: "1.0.0", body: "Plan carefully." }]);
      registry.writePack("planning", [
        { version: "1.0.0", dependencies: { "@acme/subagents/planner": "^1.0.0" } },
      ]);
      return workspace
        .provide(
          Effect.gen(function* () {
            for (const [type, source] of [
              ["subagent", "@acme/subagents/planner"],
              ["pack", "@acme/packs/planning"],
            ] as const) {
              const installed = yield* applyInstall(
                installRequest({ type, subject: { kind: "source", source } }),
              );
              expect(deriveOperationOutcome(installed), JSON.stringify(installed)).toBe("applied");
            }
            const settingsBefore = workspace.readFile("axm.json");
            const nativePath = ".claude/agents/planner.md";
            const nativeBefore = workspace.readFile(nativePath);
            const changed =
              change === "body"
                ? nativeBefore.replace("Plan carefully.", "Foreign instructions.")
                : nativeBefore.replace(/<!-- axm:file[\s\S]*?-->/g, "");
            expect(changed).not.toBe(nativeBefore);
            const writer = yield* SettingsWriter;
            let corrupted = false;
            const result = yield* applyUninstall(
              uninstallRequest({ type: "pack", selector: "planning" }),
            ).pipe(
              Effect.provideService(SettingsWriter, {
                ...writer,
                removeEntry: (type, name) =>
                  writer.removeEntry(type, name).pipe(
                    Effect.tap(() =>
                      Effect.sync(() => {
                        if (type === "pack") {
                          workspace.writeFile(nativePath, changed);
                          corrupted = true;
                        }
                      }),
                    ),
                  ),
              }),
            );
            expect(corrupted).toBe(true);
            expect(deriveOperationOutcome(result)).not.toBe("applied");
            expect(workspace.readFile("axm.json")).toBe(settingsBefore);
            expect(
              workspace.exists(
                `${fileRegistryPackagePath(registry, "packs", "planning")}/pack.json`,
              ),
            ).toBe(true);
            expect(workspace.readFile(nativePath)).toBe(changed);
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
            workspace.exists(
              `agent_extensions/_local/project/vendor/${name}/${row.canonicalFile(name)}`,
            ),
          ).toBe(true);

          yield* applyUninstall(uninstallRequest({ selector: `@acme/${row.plural}/${name}` }));

          expect(readSettings(workspace)).not.toMatchObject({
            [row.settingsKey]: { [name]: expect.anything() },
          });
          expect(workspace.readFile("axm-lock.yaml")).not.toContain(name);
          expect(workspace.exists(`agent_extensions/_local/project/vendor/${name}`)).toBe(false);
          row.expectUnrealized(workspace, name);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
