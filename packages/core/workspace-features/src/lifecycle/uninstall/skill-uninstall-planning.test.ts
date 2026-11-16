/**
 * How often Skill removal planning resolves the configured skills
 * directories.
 *
 * One planning call groups its install targets by physical directory once
 * and describes every removal from that grouping, so these examples count
 * the realPath calls on the shared and the configured agent's skills
 * directory made by the planning alone, in a real workspace with a
 * `file://` Registry.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { planSkillUninstall } from "@agentxm/extension-kinds/skills";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { SkillManager } from "@agentxm/workspace-kernel/materialization";
import { NativeLocationError } from "@agentxm/workspace-kernel/locations";
import { OperationRefused, installRefused } from "@agentxm/workspace-kernel/operations";
import { withWorkspaceReadView } from "@agentxm/workspace-kernel/workspace-state";

import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A workspace with claude-code configured and the given Registry Skills installed. */
const installedSkills = (names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    for (const name of names) {
      created.registry.writeSkill(name, [{ version: "1.0.0", body: `${name} guidance.` }]);
    }
    yield* created.workspace.provide(
      Effect.forEach(names, (name) =>
        applyInstallAcceptingExecutionChanges(
          installRequest({
            type: "skill",
            subject: { kind: "source", source: `@acme/skills/${name}` },
          }),
        ),
      ),
    );
    return created;
  });

/** Plan the removal of `names` from one read view, counting realPath calls of the planning. */
const planRecorded = (
  installed: InstallWorld,
  names: ReadonlyArray<string>,
  options: { readonly failConfiguredSourceOf?: string } = {},
) =>
  Effect.gen(function* () {
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const root = installed.workspace.root;
    const exit = yield* installed.workspace
      .provide(
        withWorkspaceReadView(
          Effect.gen(function* () {
            const manager = yield* SkillManager;
            const getConfiguredSource = manager.getConfiguredSource;
            const failing = options.failConfiguredSourceOf;
            recorder.recording.reset();
            return yield* planSkillUninstall({
              targets: names.map((name) => ({ type: "skill", name })),
            }).pipe(
              Effect.provideService(
                SkillManager,
                failing === undefined || getConfiguredSource === undefined
                  ? manager
                  : {
                      ...manager,
                      getConfiguredSource: (args) =>
                        args.target.name === failing
                          ? Effect.fail(
                              installRefused({
                                category: "internal",
                                detail: `Configured source of ${failing} is unreadable`,
                              }),
                            )
                          : getConfiguredSource(args),
                    },
              ),
            );
          }),
        ),
      )
      .pipe(Effect.provideService(FileSystem.FileSystem, recorder.fileSystem), Effect.exit);
    const realPaths = (relative: string) =>
      recorder.recording.calls({ method: "realPath", path: nodePath.join(root, relative) }).length;
    return {
      exit,
      realPaths: { shared: realPaths(".agents/skills"), claude: realPaths(".claude/skills") },
    };
  });

/** The removal artifact each planned step reports. */
const removalArtifact = (installed: InstallWorld, name: string) => ({
  path: "axm.lock",
  scope: "project",
  agents: ["claude-code"],
  change: "removed",
  targets: [
    { path: "axm.lock", change: "updated" },
    { path: "axm.json", change: "updated" },
    { path: fileRegistryPackagePath(installed.registry, "skills", name), change: "removed" },
    { path: `.agents/skills/${name}`, change: "removed" },
    { path: `.claude/skills/${name}`, change: "removed", agentIds: ["claude-code"] },
  ],
});

/** Every refusal a failed planning carries, with the failure it wraps. */
const refusals = (cause: Cause.Cause<unknown>) =>
  cause.reasons.flatMap((reason) => {
    if (!Cause.isFailReason(reason) || !(reason.error instanceof OperationRefused)) return [];
    const wrapped: unknown = reason.error.cause;
    return [
      {
        category: reason.error.category,
        detail: reason.error.detail,
        cause:
          wrapped instanceof NativeLocationError
            ? { tag: wrapped._tag, reason: wrapped.reason }
            : wrapped instanceof OperationRefused
              ? { tag: wrapped._tag, detail: wrapped.detail }
              : wrapped,
      },
    ];
  });

describe("Skill removal planning", () => {
  it.effect("groups the install targets by physical directory once for two Skills", () =>
    Effect.gen(function* () {
      const installed = yield* installedSkills(["review", "triage"]);
      const planned = yield* planRecorded(installed, ["review", "triage"]);
      expect.soft(planned.realPaths).toEqual({ shared: 1, claude: 1 });
      if (planned.exit._tag !== "Success") return yield* Effect.die(planned.exit.cause);
      const steps = planned.exit.value.jobs[0]?.steps ?? [];
      expect(steps.map((step) => step.artifact)).toEqual([
        removalArtifact(installed, "review"),
        removalArtifact(installed, "triage"),
      ]);
      // Every artifact owns its consumer list.
      const consumers = steps.map((step) => step.artifact?.targets?.[4]?.agentIds);
      expect(consumers[0]).toEqual(["claude-code"]);
      expect(consumers[0]).not.toBe(consumers[1]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("groups the install targets by physical directory once for one Skill", () =>
    Effect.gen(function* () {
      const installed = yield* installedSkills(["review"]);
      const planned = yield* planRecorded(installed, ["review"]);
      expect.soft(planned.realPaths).toEqual({ shared: 1, claude: 1 });
      if (planned.exit._tag !== "Success") return yield* Effect.die(planned.exit.cause);
      expect(planned.exit.value.jobs[0]?.steps.map((step) => step.artifact)).toEqual([
        removalArtifact(installed, "review"),
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves no skills directory when nothing is selected", () =>
    Effect.gen(function* () {
      const installed = yield* installedSkills([]);
      const planned = yield* planRecorded(installed, []);
      expect.soft(planned.realPaths).toEqual({ shared: 0, claude: 0 });
      expect(planned.exit._tag).toBe("Success");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a dangling shared skills directory as the removal being planned", () =>
    Effect.gen(function* () {
      const installed = yield* installedSkills(["review"]);
      const shared = nodePath.join(installed.workspace.root, ".agents/skills");
      fs.rmSync(shared, { recursive: true, force: true });
      fs.symlinkSync(nodePath.join(installed.workspace.root, "missing"), shared);
      const planned = yield* planRecorded(installed, ["review"]);
      expect(planned.exit._tag).toBe("Failure");
      if (planned.exit._tag !== "Failure") return;
      expect(refusals(planned.exit.cause)).toEqual([
        {
          category: "internal",
          detail: "Skill uninstall planning failed for review",
          cause: { tag: "NativeLocationError", reason: "dangling-leaf" },
        },
      ]);
      expect(planned.realPaths.shared).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a dangling shared skills directory for one of the Skills planned", () =>
    Effect.gen(function* () {
      const installed = yield* installedSkills(["review", "triage"]);
      const shared = nodePath.join(installed.workspace.root, ".agents/skills");
      fs.rmSync(shared, { recursive: true, force: true });
      fs.symlinkSync(nodePath.join(installed.workspace.root, "missing"), shared);
      const planned = yield* planRecorded(installed, ["review", "triage"]);
      expect(planned.exit._tag).toBe("Failure");
      if (planned.exit._tag !== "Failure") return;
      // Both removals plan concurrently, so the refusal names whichever
      // selected Skill reached the grouping's failure first.
      const [refusal, ...others] = refusals(planned.exit.cause);
      expect(others).toEqual([]);
      expect([
        "Skill uninstall planning failed for review",
        "Skill uninstall planning failed for triage",
      ]).toContain(refusal?.detail);
      expect(refusal).toMatchObject({
        category: "internal",
        cause: { tag: "NativeLocationError", reason: "dangling-leaf" },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("still reports the Skill whose configured source could not be read", () =>
    Effect.gen(function* () {
      const installed = yield* installedSkills(["review", "triage"]);
      const planned = yield* planRecorded(installed, ["review", "triage"], {
        failConfiguredSourceOf: "triage",
      });
      expect(planned.exit._tag).toBe("Failure");
      if (planned.exit._tag !== "Failure") return;
      expect(refusals(planned.exit.cause)).toEqual([
        {
          category: "internal",
          detail: "Skill uninstall planning failed for triage",
          cause: { tag: "OperationRefused", detail: "Configured source of triage is unreadable" },
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
