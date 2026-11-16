import * as nodePath from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import type { Plan } from "@agentxm/workspace-kernel/operations";
import {
  acceptedLockedResolutionRef,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import {
  applyInstall,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../testing/install-world.js";
import { withSourceSwitches } from "./source-switch.js";

const SKILL = "review";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

/** One planned install of the Skill that binds the given proposal. */
const planBinding = (ref: ExtensionRef): Plan => ({
  _tag: "Plan",
  name: "Install extensions",
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          readiness: "ready",
          label: `Install ${SKILL}`,
          sourceBinding: { extensionType: "skill", target: SKILL, ref },
          run: Effect.succeed({ result: "success", message: "Installed" }),
        },
      ],
    },
  ],
});

/** A workspace that accepted the Skill from its file Registry. */
const acceptedSkill = (cleanups: Array<() => void>) =>
  Effect.gen(function* () {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    world.registry.writeSkill(SKILL, [{ version: "1.0.0", body: "Accepted guidance." }]);
    yield* world.workspace.provide(
      applyInstall(
        installRequest({
          type: "skill",
          subject: { kind: "source", source: `@acme/skills/${SKILL}` },
        }),
      ),
    );
    return world;
  });

/**
 * Classify one proposal derived from the accepted ref inside one planning
 * read phase, counting only the classification's own work.
 */
const classify = <R = never>(
  world: InstallWorld,
  propose: (accepted: ExtensionRef) => ExtensionRef,
  beforeClassification: Effect.Effect<void, never, R> = Effect.void,
) =>
  Effect.gen(function* () {
    const work = workObservations(false);
    const classified = yield* world.workspace.provide(
      withWorkspaceReadView(
        Effect.gen(function* () {
          const accepted = yield* acceptedLockedResolutionRef({ type: "skill", name: SKILL });
          if (Option.isNone(accepted)) throw new Error("The Skill was not accepted");
          const plan = planBinding(propose(accepted.value));
          yield* beforeClassification;
          const result = yield* withSourceSwitches(plan, []).pipe(work.provide, Effect.result);
          return { plan, result };
        }),
      ),
    );
    return {
      ...classified,
      treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
      distributionHashes: work.facts.filter((fact) => fact.kind === "axm.hash.distribution-tree")
        .length,
    };
  });

/** The same accepted package offered from another Registry endpoint. */
const fromOtherRegistry = (ref: ExtensionRef): ExtensionRef =>
  ref.refType === "registry"
    ? {
        ...ref,
        source: {
          ...ref.source,
          location: decodeRegistryEndpointSync("https://registry.invalid/"),
        },
      }
    : ref;

describe("Source-switch classification", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("leaves a repeat install at the accepted locator unchanged without observing it", () =>
    Effect.gen(function* () {
      const world = yield* acceptedSkill(cleanups);

      const classified = yield* classify(world, (accepted) => accepted);

      expect(classified.result._tag).toBe("Success");
      if (classified.result._tag !== "Success") return;
      expect(classified.result.success).toBe(classified.plan);
      expect(classified.treeHashes).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("still observes the accepted content when the locator changes", () =>
    Effect.gen(function* () {
      const world = yield* acceptedSkill(cleanups);
      const canonical = nodePath.join(
        world.workspace.root,
        fileRegistryPackagePath(world.registry, "skills", SKILL),
      );
      fs.writeFileSync(nodePath.join(canonical, "drift.txt"), "Local drift.\n");

      const classified = yield* classify(world, fromOtherRegistry);

      expect(classified.treeHashes).toBe(1);
      expect(classified.result._tag).toBe("Success");
      if (classified.result._tag !== "Success") return;
      const detail =
        "Source switch refused because the accepted registry content is materialization-mismatch; repair or restore it before replacement";
      expect(classified.result.success.riskConditions).toEqual([
        {
          level: "blocked",
          id: "source-switch-current-state",
          detail,
          errorCode: "conflict",
        },
      ]);
      expect(classified.result.success.jobs[0]?.steps[0]).toMatchObject({
        readiness: "error",
        errorMessage: detail,
        artifact: {
          path: fileRegistryPackagePath(world.registry, "skills", SKILL),
          change: "updated",
        },
        blockingConditionIds: ["source-switch-current-state"],
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a changed identity before judging the accepted content", () =>
    Effect.gen(function* () {
      const world = yield* acceptedSkill(cleanups);

      const classified = yield* classify(world, (accepted) => {
        const moved = fromOtherRegistry(accepted);
        return moved.refType === "registry"
          ? { ...moved, owner: decodeHandleSync("@other") }
          : moved;
      });

      expect(classified.treeHashes).toBe(1);
      expect(classified.result._tag).toBe("Success");
      if (classified.result._tag !== "Success") return;
      expect(classified.result.success.riskConditions).toEqual([
        expect.objectContaining({
          level: "blocked",
          detail:
            "Source switch refused because @acme/skills/review and @other/skills/review are different extension identities",
        }),
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reads a local proposal's manifest once when comparing it with a Registry acceptance",
    () =>
      Effect.gen(function* () {
        const world = yield* acceptedSkill(cleanups);
        const canonical = nodePath.join(
          world.workspace.root,
          fileRegistryPackagePath(world.registry, "skills", SKILL),
        );
        const proposed = fs.mkdtempSync(nodePath.join(world.workspace.root, "..", "proposal-"));
        cleanups.push(() => fs.rmSync(proposed, { recursive: true, force: true }));
        fs.cpSync(canonical, proposed, { recursive: true });
        const recording = yield* FileSystemRecorder;

        const classified = yield* classify(
          world,
          (accepted): ExtensionRef => ({
            refType: "local",
            type: "skill",
            source: { type: "local", path: proposed },
            owner: decodeHandleSync("@acme"),
            name: accepted.name,
            location: pathToFileURL(proposed).href,
            skill: { name: accepted.name, description: Option.none(), metadata: Option.none() },
          }),
          Effect.sync(() => recording.reset()),
        );

        const manifestReads = (directory: string) =>
          recording.calls({ method: "readFile", path: nodePath.join(directory, "skill.json") })
            .length;
        // The accepted Registry side takes no manifest read ahead of its hash, so its reads stay as they were.
        expect({ proposed: manifestReads(proposed), accepted: manifestReads(canonical) }).toEqual({
          proposed: 1,
          accepted: 3,
        });
        expect(classified.distributionHashes).toBe(2);
        expect(classified.result._tag).toBe("Success");
        if (classified.result._tag !== "Success") return;
        const step = classified.result.success.jobs[0]?.steps[0];
        expect(step?.readiness).toBe("warn");
        const evidence = step?.artifact?.sourceSwitch;
        expect(evidence?.before.family).toBe("registry");
        expect(evidence?.after.family).toBe("path");
        expect(evidence?.after.treeIntegrity).toBe(evidence?.before.treeIntegrity);
      }).pipe(Effect.provide(recordedNodeServices)),
  );

  it.effect(
    "compares a local proposal's distribution from the listing its ignore observation walked",
    () =>
      Effect.gen(function* () {
        const world = yield* acceptedSkill(cleanups);
        const canonical = nodePath.join(
          world.workspace.root,
          fileRegistryPackagePath(world.registry, "skills", SKILL),
        );
        const proposed = fs.mkdtempSync(nodePath.join(world.workspace.root, "..", "proposal-"));
        cleanups.push(() => fs.rmSync(proposed, { recursive: true, force: true }));
        fs.cpSync(canonical, proposed, { recursive: true });
        const recording = yield* FileSystemRecorder;

        const classified = yield* classify(
          world,
          (accepted): ExtensionRef => ({
            refType: "local",
            type: "skill",
            source: { type: "local", path: proposed },
            owner: decodeHandleSync("@acme"),
            name: accepted.name,
            location: pathToFileURL(proposed).href,
            skill: { name: accepted.name, description: Option.none(), metadata: Option.none() },
          }),
          Effect.sync(() => recording.reset()),
        );

        const counted = (relative: string) => {
          const calls = recording.counts(
            relative === "" ? proposed : nodePath.join(proposed, relative),
          );
          return {
            readDirectory: calls.readDirectory ?? 0,
            readLink: calls.readLink ?? 0,
            stat: calls.stat ?? 0,
            readFile: calls.readFile ?? 0,
          };
        };
        expect(fs.readdirSync(proposed).sort()).toEqual(["skill.json", "src"]);
        expect(fs.readdirSync(nodePath.join(proposed, "src"))).toEqual(["SKILL.md"]);
        // One listing of each directory and one link probe and stat of each
        // entry serve the ignore observation and the distribution hash.
        expect(counted("")).toEqual({ readDirectory: 1, readLink: 0, stat: 0, readFile: 0 });
        expect(counted("src")).toEqual({ readDirectory: 1, readLink: 1, stat: 1, readFile: 0 });
        expect(counted("skill.json")).toEqual({
          readDirectory: 0,
          readLink: 1,
          stat: 1,
          readFile: 1,
        });
        expect(counted(nodePath.join("src", "SKILL.md"))).toEqual({
          readDirectory: 0,
          readLink: 1,
          stat: 1,
          readFile: 1,
        });
        // Each walked directory's ignore input is still probed itself.
        for (const directory of [proposed, nodePath.join(proposed, "src")])
          expect(recording.counts(nodePath.join(directory, ".gitignore"))).toEqual({
            readLink: 1,
            stat: 1,
          });
        expect(classified.distributionHashes).toBe(2);
        expect(classified.result._tag).toBe("Success");
        if (classified.result._tag !== "Success") return;
        const evidence = classified.result.success.jobs[0]?.steps[0]?.artifact?.sourceSwitch;
        expect(evidence?.content).toBe("equivalent");
        expect(evidence?.after.treeIntegrity).toBe(evidence?.before.treeIntegrity);
      }).pipe(Effect.provide(recordedNodeServices)),
  );
});
