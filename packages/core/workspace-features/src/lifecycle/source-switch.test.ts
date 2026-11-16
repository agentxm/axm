import * as nodePath from "node:path";
import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
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
const classify = (world: InstallWorld, propose: (accepted: ExtensionRef) => ExtensionRef) =>
  Effect.gen(function* () {
    const work = workObservations(false);
    const classified = yield* world.workspace.provide(
      withWorkspaceReadView(
        Effect.gen(function* () {
          const accepted = yield* acceptedLockedResolutionRef({ type: "skill", name: SKILL });
          if (Option.isNone(accepted)) throw new Error("The Skill was not accepted");
          const plan = planBinding(propose(accepted.value));
          const result = yield* withSourceSwitches(plan, []).pipe(work.provide, Effect.result);
          return { plan, result };
        }),
      ),
    );
    return {
      ...classified,
      treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
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
});
