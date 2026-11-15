import * as nodePath from "node:path";
import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  deriveOperationOutcome,
  type AcceptedContentObservation,
  type Plan,
} from "@agentxm/workspace-kernel/operations";
import {
  acceptedLockedResolutionRef,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../testing/install-world.js";
import { prepareAcquisitionPlan } from "./prepare-acquisition-plan.js";

const HOOK = "guard";

/**
 * One planned step that needs the given external source tree, with the
 * accepted-package observations its planner made, if any.
 */
const planAcquiring = (
  ref: ExtensionRef,
  acceptedContent?: ReadonlyArray<AcceptedContentObservation>,
): Plan => ({
  _tag: "Plan",
  name: "Update extensions",
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          readiness: "ready",
          label: `Update ${HOOK}`,
          acquisitionRefs: [ref],
          ...(acceptedContent === undefined ? {} : { acceptedContent }),
          run: Effect.succeed({ result: "success", message: "Updated" }),
        },
      ],
    },
  ],
});

/** A workspace that accepted the Hook from its file Registry. */
const acceptedHook = (cleanups: Array<() => void>) =>
  Effect.gen(function* () {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    world.registry.writeHook(HOOK, [{ version: "1.0.0" }]);
    const installed = yield* world.workspace.provide(
      applyInstallAcceptingExecutionChanges(
        installRequest({
          type: "hook",
          subject: { kind: "source", source: `@acme/hooks/${HOOK}` },
        }),
      ),
    );
    expect(deriveOperationOutcome(installed)).toBe("applied");
    return world;
  });

/**
 * Settle one proposal derived from the accepted ref inside one planning read
 * phase, counting only the settlement's own work.
 */
const settle = (
  world: InstallWorld,
  propose: (accepted: ExtensionRef) => ExtensionRef,
  reinstall = false,
  acceptedContent?: ReadonlyArray<AcceptedContentObservation>,
) =>
  Effect.gen(function* () {
    const work = workObservations(false);
    const settled = yield* world.workspace.provide(
      withWorkspaceReadView(
        Effect.gen(function* () {
          const accepted = yield* acceptedLockedResolutionRef({ type: "hook", name: HOOK });
          if (Option.isNone(accepted)) throw new Error("The Hook was not accepted");
          const proposed = propose(accepted.value);
          const plan = yield* prepareAcquisitionPlan(
            planAcquiring(proposed, acceptedContent),
            reinstall,
          ).pipe(work.provide);
          return { accepted: accepted.value, proposed, plan };
        }),
      ),
    );
    const step = settled.plan.jobs[0]?.steps[0];
    return {
      ...settled,
      carriesObservations: step !== undefined && "acceptedContent" in step,
      acquisitionRefs: step?.readiness === "error" ? undefined : step?.acquisitionRefs,
      treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
    };
  });

/** The same Registry package one version later. */
const advanced = (ref: ExtensionRef): ExtensionRef =>
  ref.refType === "registry" ? { ...ref, version: decodeVersionSync("2.0.0") } : ref;

describe("Acquisition reuse of accepted Registry content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("acquires a version advance without observing the accepted content", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);

      const settled = yield* settle(world, advanced);

      expect(settled.acquisitionRefs).toEqual([settled.proposed]);
      expect(settled.treeHashes).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reuses intact accepted content for the accepted version", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);

      const settled = yield* settle(world, (accepted) => accepted);

      expect(settled.acquisitionRefs).toEqual([]);
      expect(settled.treeHashes).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("re-acquires the accepted version when its content drifted", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);
      const canonical = nodePath.join(
        world.workspace.root,
        fileRegistryPackagePath(world.registry, "hooks", HOOK),
      );
      fs.writeFileSync(nodePath.join(canonical, "drift.txt"), "Local drift.\n");

      const settled = yield* settle(world, (accepted) => accepted);

      expect(settled.acquisitionRefs).toEqual([settled.accepted]);
      expect(settled.treeHashes).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("takes the planner's observation of the same package in this phase", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);
      const canonical = nodePath.join(
        world.workspace.root,
        fileRegistryPackagePath(world.registry, "hooks", HOOK),
      );
      fs.writeFileSync(nodePath.join(canonical, "drift.txt"), "Local drift.\n");

      const settled = yield* settle(world, (accepted) => accepted, false, [
        { type: "hook", name: HOOK },
      ]);

      expect(settled.acquisitionRefs).toEqual([settled.accepted]);
      expect(settled.carriesObservations).toBe(false);
      expect(settled.treeHashes).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("observes a package its planner did not observe", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);

      const settled = yield* settle(world, (accepted) => accepted, false, [
        { type: "hook", name: "other" },
        { type: "skill", name: HOOK },
      ]);

      expect(settled.acquisitionRefs).toEqual([]);
      expect(settled.carriesObservations).toBe(false);
      expect(settled.treeHashes).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("acquires a reinstall without observing the accepted content", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);

      const settled = yield* settle(world, (accepted) => accepted, true);

      expect(settled.acquisitionRefs).toEqual([settled.accepted]);
      expect(settled.treeHashes).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
