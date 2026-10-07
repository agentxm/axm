import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { InstallExtensions } from "./install-extensions.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/install/installed-skills-follow-settlement",
  title: "Install observations follow committed fresh skill acquisitions",
  statement:
    "An explicit skill install shall expose one neutral observation per freshly acquired skill only after committed settlement with usable native output; preview, unchanged reapplication, repair, rollback, cancellation, and bootstrap shall expose none, and deliberate fresh reinstall shall be marked separately.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: ["cli/install/apply-realizes-the-previewed-closure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
describe("Settled skill acquisitions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect(
    "observes fresh install and deliberate reinstall, excluding preview, no-op, and native repair",
    () => {
      const { workspace, cleanup } = makeInstallWorld({ installedExecutables: ["claude"] });
      cleanups.push(cleanup);
      const source = writeLocalSkillPackage(workspace.root, { name: "review" });
      const request = installRequest({ type: "skill", subject: { kind: "source", source } });
      return workspace
        .provide(
          Effect.gen(function* () {
            const candidate = yield* InstallExtensions.prepare(request);
            expect(
              (yield* InstallExtensions.previewOrApply(candidate, previewPlanExecution))
                .installedSkills,
            ).toEqual([]);
            const result = yield* InstallExtensions.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            );
            expect(result.installedSkills).toHaveLength(1);
            expect(result.installedSkills[0]).toMatchObject({
              scope: "project",
              installKind: "install",
              targetAgents: ["claude-code"],
            });
            const configured = installRequest({ type: "skill", subject: { kind: "configured" } });
            const warm = yield* InstallExtensions.prepare(configured);
            expect(
              (yield* InstallExtensions.previewOrApply(warm, preapprovedPlanExecution))
                .installedSkills,
            ).toEqual([]);
            const fs = yield* FileSystem.FileSystem;
            yield* fs.remove(`${workspace.root}/.claude/skills/review`, { recursive: true });
            const repair = yield* InstallExtensions.prepare(configured);
            expect(
              (yield* InstallExtensions.previewOrApply(repair, preapprovedPlanExecution))
                .installedSkills,
            ).toEqual([]);
            const forced = yield* InstallExtensions.prepare({ ...configured, reinstall: true });
            const reinstalled = yield* InstallExtensions.previewOrApply(
              forced,
              preapprovedPlanExecution,
            );
            expect(reinstalled.installedSkills).toEqual([]);
            yield* fs.writeFileString(
              `${workspace.root}/.claude/skills/review/SKILL.md`,
              "---\nname: review\ndescription: Damaged retained skill.\n---\nUnaccepted content.\n",
            );
            const changed = yield* InstallExtensions.prepare({ ...request, reinstall: true });
            const freshlyReinstalled = yield* InstallExtensions.previewOrApply(
              changed,
              preapprovedPlanExecution,
            );
            expect(
              yield* fs.readFileString(`${workspace.root}/.claude/skills/review/SKILL.md`),
            ).toBe(yield* fs.readFileString(`${source}/src/SKILL.md`));
            expect(freshlyReinstalled.installedSkills).toHaveLength(1);
            expect(freshlyReinstalled.installedSkills[0]?.installKind).toBe("reinstall");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    30_000,
  );
  it.effect(
    "counts only new pack members and deduplicates a directly installed member",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      registry.writeSkill("stable", [{ version: "1.0.0", body: "Stable." }]);
      registry.writeSkill("added", [{ version: "1.0.0", body: "Added." }]);
      registry.writePack("toolkit", [
        {
          version: "1.0.0",
          dependencies: { "@acme/skills/stable": "^1.0.0", "@acme/skills/added": "^1.0.0" },
        },
      ]);
      const resolve = (source: string, type: "skill" | "pack") =>
        Effect.gen(function* () {
          const candidate = yield* InstallExtensions.prepare(
            installRequest({ type, subject: { kind: "source", source } }),
          );
          return yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
        });
      return workspace
        .provide(
          Effect.gen(function* () {
            expect((yield* resolve("@acme/skills/stable", "skill")).installedSkills).toHaveLength(
              1,
            );
            const pack = yield* resolve("@acme/packs/toolkit", "pack");
            expect(pack.installedSkills.map((skill) => skill.ref.name)).toEqual(["added"]);
            expect(pack.installedSkills[0]?.targetAgents).toEqual([]);
            expect((yield* resolve("@acme/packs/toolkit", "pack")).installedSkills).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    30_000,
  );
});
