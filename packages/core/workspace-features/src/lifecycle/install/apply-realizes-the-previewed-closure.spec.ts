import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { InstallExtensions } from "./install-extensions.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  previewInstall,
} from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/install/apply-realizes-the-previewed-closure",
  title: "An unchanged install request applies the plan shown in its preview",
  statement:
    "When an install preview is followed by an apply of the same request against an unchanged workspace, the install shall realize exactly the closure the preview described, committing the same plan candidate and the same units, and the described extension shall be present in the workspace afterwards; if material workspace state changes after preparation, apply shall reject the stale candidate without overwriting the intervening change, including warm no-op installs.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "extension-adoption"],
  methods: ["example"],
  derivedFrom: ["cli/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The install preview lists the closure's units and plan candidate but no artifact paths or target surfaces, while the apply lists both; whether a preview should describe target surfaces, as skill and subagent creation do, is unresolved, so this specification requires agreement on the plan candidate and unit set only.",
  ],
});

describe("Install apply realizes the previewed closure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(["directory", "symlink"] as const)(
    "bundled recovery reports an existing unowned %s in both preview and apply",
    (kind) => {
      const { workspace, cleanup } = makeInstallWorld({
        settings: { skills: { axm: { source: "workspace", origin: "bundled" } } },
      });
      cleanups.push(cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const target = path.join(workspace.root, ".claude/skills/axm");
            if (kind === "directory") {
              workspace.writeFile(".claude/skills/axm/SKILL.md", "Preserve these instructions.\n");
            } else {
              workspace.writeFile("older-skill/SKILL.md", "Preserve this source.\n");
              yield* fs.makeDirectory(path.dirname(target), { recursive: true });
              yield* fs.symlink(path.join(workspace.root, "older-skill"), target);
            }
            const before = workspace.snapshot();
            const request = installRequest({ type: "skill", subject: { kind: "bundled" } });
            const preview = yield* previewInstall(request);
            expect(deriveOperationOutcome(preview)).toBe("blocked");
            expect(JSON.stringify(preview)).toContain("Preserved unowned skill artifact");
            expect(JSON.stringify(preview)).toContain(target);
            expect(workspace.snapshot()).toEqual(before);
            const applied = yield* applyInstall(request);
            expect(deriveOperationOutcome(applied)).toBe("blocked");
            expect(applied.candidateId).toBe(preview.candidateId);
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("rejects a stale warm explicit install", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );
          const candidate = yield* InstallExtensions.prepare(
            installRequest({
              subject: { kind: "source", source },
            }),
          );
          const beforePreview = workspace.snapshot();
          yield* InstallExtensions.previewOrApply(candidate, previewPlanExecution);
          expect(workspace.snapshot()).toEqual(beforePreview);
          workspace.writeFile(
            "agent_extensions/_local/project/vendor/code-review/src/SKILL.md",
            "Intervening edit.\n",
          );
          const intervening = workspace.snapshot();
          const { resolution: result } = yield* InstallExtensions.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(result.blocking?.class, JSON.stringify(result)).toBe("stale-candidate");
          expect(workspace.snapshot()).toEqual(intervening);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("apply commits the same plan candidate and units the preview described", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    const request = installRequest({ type: "skill", subject: { kind: "source", source } });
    return workspace
      .provide(
        Effect.gen(function* () {
          const previewed = yield* previewInstall(request);
          const applied = yield* applyInstall(request);

          expect(deriveOperationOutcome(previewed)).toBe("previewed");
          expect(deriveOperationOutcome(applied)).toBe("applied");
          expect(previewed.candidateId).toEqual(expect.any(String));
          expect(applied.candidateId).toBe(previewed.candidateId);

          const describedUnits = previewed.units.map((unit) => unit.id);
          expect(describedUnits.length).toBeGreaterThan(0);
          expect(applied.units.map((unit) => unit.id)).toEqual(describedUnits);
          expect(applied.units.every((unit) => unit.state === "committed")).toBe(true);

          expect(workspace.exists(".claude/skills/code-review")).toBe(true);
          expect(workspace.exists("agent_extensions/_local/project/vendor/code-review")).toBe(true);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
