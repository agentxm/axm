import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { defineSpecification } from "@agentxm/specification-metadata";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { UpdateExtensions } from "./update-extensions.js";
import { configuredUpdateRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/reinstalled-skills-follow-settlement",
  title: "Reinstall observations follow committed fresh skill acquisitions",
  statement:
    "An update with --reinstall shall expose one neutral observation marked as reinstall for each freshly reacquired skill only after committed settlement with usable native output; preview, unchanged reapplication, rollback, and interruption shall expose none.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/installed-skills-follow-settlement",
    "cli/update/reinstall-reacquires-accepted-content",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Settled reinstall skill acquisitions", () => {
  it.effect.each([false, true])(
    "observes a committed fresh acquisition (selected: %s)",
    (selected) => {
      const { workspace, cleanup } = makeInstallWorld({ installedExecutables: ["claude"] });
      const source = writeLocalSkillPackage(workspace.root, { name: "review" });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source } }),
            );
            const request = configuredUpdateRequest({
              type: "skill",
              reinstall: true,
              ...(selected ? { nameFilters: ["review"] } : {}),
            });
            const unchanged = yield* UpdateExtensions.prepare(request);
            if (unchanged.outcome === "nothing-configured")
              throw new Error("Expected an accepted skill");
            const repeated = yield* UpdateExtensions.previewOrApply(
              unchanged,
              preapprovedPlanExecution,
            );
            expect(deriveOperationOutcome(repeated.resolution)).toBe("no-op");
            expect(repeated.installedSkills).toEqual([]);
            const fs = yield* FileSystem.FileSystem;
            yield* fs.writeFileString(
              `${workspace.root}/.claude/skills/review/SKILL.md`,
              "---\nname: review\ndescription: Damaged retained skill.\n---\nUnaccepted content.\n",
            );
            const before = workspace.snapshot();
            const candidate = yield* UpdateExtensions.prepare(request);
            if (candidate.outcome === "nothing-configured")
              throw new Error("Expected an accepted skill");
            const preview = yield* UpdateExtensions.previewOrApply(candidate, previewPlanExecution);
            expect(preview.installedSkills).toEqual([]);
            expect(workspace.snapshot()).toEqual(before);
            const restored = yield* UpdateExtensions.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            );
            expect(
              deriveOperationOutcome(restored.resolution),
              JSON.stringify(restored.resolution),
            ).toBe("applied");
            expect(
              yield* fs.readFileString(`${workspace.root}/.claude/skills/review/SKILL.md`),
            ).toBe(yield* fs.readFileString(`${source}/src/SKILL.md`));
            expect(restored.installedSkills).toHaveLength(1);
            expect(restored.installedSkills[0]).toMatchObject({
              installKind: "reinstall",
              scope: "project",
              targetAgents: ["claude-code"],
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    },
  );
});
