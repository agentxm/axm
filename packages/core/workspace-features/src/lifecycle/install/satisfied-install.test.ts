import { fileRegistryPackagePath } from "../../testing/install-world.js";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SettingsWriter,
  AcceptedResolutionWriter,
} from "@agentxm/workspace-kernel/workspace-state";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { applyPlanExecution, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { SkillManager } from "@agentxm/workspace-kernel/materialization";
import {
  applyInstall,
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";
import { InstallExtensions } from "../index.js";

/**
 * Repeat an accepted Registry install and count only the repeated apply's
 * work: the accepted package's tree hashes and content reads of its manifest.
 */
const repeatedApplyWork = (type: "subagent" | "hook", name: string) =>
  Effect.gen(function* () {
    const world = makeInstallWorld();
    if (type === "subagent") world.registry.writeSubagent(name, [{ version: "1.0.0" }]);
    else world.registry.writeHook(name, [{ version: "1.0.0" }]);
    const request = installRequest({
      type,
      subject: { kind: "source", source: `@acme/${type}s/${name}@1.0.0` },
    });
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const work = workObservations(false);
    const manifest = path.join(
      world.workspace.root,
      fileRegistryPackagePath(world.registry, `${type}s`, name),
      `${type}.json`,
    );
    const outcome = yield* world.workspace
      .provide(
        Effect.gen(function* () {
          const installed = yield* applyInstallAcceptingExecutionChanges(request);
          expect(deriveOperationOutcome(installed)).toBe("applied");
          const candidate = yield* InstallExtensions.prepare(request);
          recorder.recording.reset();
          const repeated = yield* InstallExtensions.previewOrApply(
            candidate,
            applyPlanExecution({
              approval: "preapproved",
              acceptedPolicies: new Set(["accept-execution-changes"]),
              recovery: { command: ["install"], arguments: [] },
            }),
          ).pipe(work.provide);
          return deriveOperationOutcome(repeated.resolution);
        }),
      )
      .pipe(
        Effect.provideService(FileSystem.FileSystem, recorder.fileSystem),
        Effect.ensuring(Effect.sync(world.cleanup)),
      );
    return {
      outcome,
      treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
      manifestReads: recorder.recording.contentReads(manifest),
    };
  });

describe("satisfied install execution", () => {
  it.effect("retains Pack member agent coverage without materializing satisfied members", () => {
    const world = makeInstallWorld({ settings: { agents: ["claude-code", "cursor"] } });
    world.registry.writeSkill("review", [{ version: "1.0.0", body: "Review carefully." }]);
    world.registry.writePack("toolkit", [
      { version: "1.0.0", dependencies: { "@acme/skills/review": "^1.0.0" } },
    ]);
    const request = installRequest({
      type: "pack",
      subject: { kind: "source", source: "@acme/packs/toolkit" },
    });
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(request);
          const manager = yield* SkillManager;
          let materializations = 0;
          const result = yield* applyInstall(request).pipe(
            Effect.provideService(SkillManager, {
              ...manager,
              materializeInstall: (args) => {
                materializations += 1;
                return manager.materializeInstall(args);
              },
            }),
          );
          expect(deriveOperationOutcome(result)).toBe("no-op");
          expect(result.units).toHaveLength(1);
          expect(result.units[0]?.artifact?.agents).toEqual(["claude-code", "cursor"]);
          expect(materializations).toBe(0);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
  });

  it.effect.each([
    "satisfied",
    "missing-content",
    "drifted-content",
    "missing-projection",
    "changed-constraint",
  ] as const)("%s installs skip only work proven unnecessary", (state) => {
    const world = makeInstallWorld();
    world.registry.writeSkill("review", [{ version: "1.0.0", body: "Review carefully." }]);
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "@acme/skills/review@^1.0.0" },
            }),
          );
          const canonical = path.join(
            world.workspace.root,
            fileRegistryPackagePath(world.registry, "skills", "review"),
          );
          if (state === "missing-content") fs.rmSync(canonical, { recursive: true });
          if (state === "drifted-content")
            fs.appendFileSync(path.join(canonical, "src/SKILL.md"), "\nChanged locally.");
          if (state === "missing-projection")
            fs.unlinkSync(path.join(world.workspace.root, ".claude/skills/review"));
          const manager = yield* SkillManager;
          const settings = yield* SettingsWriter;
          const accepted = yield* AcceptedResolutionWriter;
          let declarations = 0;
          let recordings = 0;
          let materializations = 0;
          const result = yield* applyInstall(
            installRequest({
              type: "skill",
              subject: {
                kind: "source",
                source:
                  state === "changed-constraint"
                    ? "@acme/skills/review@*"
                    : "@acme/skills/review@^1.0.0",
              },
            }),
          ).pipe(
            Effect.provideService(SettingsWriter, {
              ...settings,
              setEntry: (type, name, entry, options) => {
                if (type === "skill" && name === "review") declarations += 1;
                return settings.setEntry(type, name, entry, options);
              },
            }),
            Effect.provideService(AcceptedResolutionWriter, {
              ...accepted,
              setAccepted: (type, key, entry, options) => {
                if (type === "skill" && key === "review") recordings += 1;
                return accepted.setAccepted(type, key, entry, options);
              },
            }),
            Effect.provideService(SkillManager, {
              ...manager,
              materializeInstall: (args) => {
                if (args.ref.skill.name === "review") materializations += 1;
                return manager.materializeInstall(args);
              },
            }),
          );
          expect(deriveOperationOutcome(result), JSON.stringify(result)).toBe(
            state === "satisfied" ? "no-op" : "applied",
          );
          expect(materializations).toBe(state === "satisfied" ? 0 : 1);
          expect(declarations).toBe(state === "satisfied" ? 0 : 1);
          expect(recordings).toBe(state === "satisfied" ? 0 : 1);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(world.cleanup)));
  });

  it.effect("a satisfied Subagent repeat observes its accepted package once", () =>
    Effect.gen(function* () {
      const work = yield* repeatedApplyWork("subagent", "reviewer");

      expect(work).toEqual({ outcome: "no-op", treeHashes: 1, manifestReads: 6 });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a satisfied Hook repeat keeps its observations", () =>
    Effect.gen(function* () {
      const work = yield* repeatedApplyWork("hook", "guard");

      expect(work).toEqual({ outcome: "no-op", treeHashes: 4, manifestReads: 12 });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
