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
  LockfileReader,
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
 * accepted-package observations its planner made, if any, and, when
 * `bindsSource`, proposing that tree as the Hook's source binding.
 */
const planAcquiring = (
  ref: ExtensionRef,
  acceptedContent?: ReadonlyArray<AcceptedContentObservation>,
  bindsSource = false,
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
          ...(bindsSource ? { sourceBinding: { extensionType: "hook", target: HOOK, ref } } : {}),
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
 * phase, counting only the settlement's own work, including each lookup of
 * the Hook's accepted row.
 */
const settle = (
  world: InstallWorld,
  propose: (accepted: ExtensionRef) => ExtensionRef,
  reinstall = false,
  acceptedContent?: ReadonlyArray<AcceptedContentObservation>,
  bindsSource = false,
) =>
  Effect.gen(function* () {
    const work = workObservations(false);
    let acceptedRowLookups = 0;
    const settled = yield* world.workspace.provide(
      withWorkspaceReadView(
        Effect.gen(function* () {
          const accepted = yield* acceptedLockedResolutionRef({ type: "hook", name: HOOK });
          if (Option.isNone(accepted)) throw new Error("The Hook was not accepted");
          const proposed = propose(accepted.value);
          const plan = yield* prepareAcquisitionPlan(
            planAcquiring(proposed, acceptedContent, bindsSource),
            reinstall,
          ).pipe(
            work.provide,
            Effect.updateService(LockfileReader, (reader) => ({
              ...reader,
              acceptedEntry: (type, name) => {
                if (type === "hook" && name === HOOK) acceptedRowLookups += 1;
                return reader.acceptedEntry(type, name);
              },
            })),
          );
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
      acceptedRowLookups,
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
      // The accepted path and the recorded ref; publisher trust compares the
      // proposal with that same ref.
      expect(settled.acceptedRowLookups).toBe(3);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reuses intact accepted content for the accepted version", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);

      const settled = yield* settle(world, (accepted) => accepted);

      expect(settled.acquisitionRefs).toEqual([]);
      expect(settled.treeHashes).toBe(1);
      // The accepted path, the recorded ref (presence and reconstruction),
      // and the observation; the usable verdict reconstructs nothing again.
      expect(settled.acceptedRowLookups).toBe(4);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reconstructs the accepted ref once for publisher trust and the source switch", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);

      const settled = yield* settle(world, (accepted) => accepted, false, undefined, true);

      expect(settled.acquisitionRefs).toEqual([]);
      expect(settled.treeHashes).toBe(1);
      expect(settled.plan.riskConditions ?? []).toEqual([]);
      // The source switch still reads the accepted row's presence itself.
      expect(settled.acceptedRowLookups).toBe(5);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("re-acquires drifted content against the same accepted ref for every check", () =>
    Effect.gen(function* () {
      const world = yield* acceptedHook(cleanups);
      const canonical = nodePath.join(
        world.workspace.root,
        fileRegistryPackagePath(world.registry, "hooks", HOOK),
      );
      fs.writeFileSync(nodePath.join(canonical, "drift.txt"), "Local drift.\n");

      const settled = yield* settle(world, (accepted) => accepted, false, undefined, true);

      expect(settled.acquisitionRefs).toEqual([settled.accepted]);
      expect(settled.treeHashes).toBe(1);
      expect(settled.plan.riskConditions ?? []).toEqual([]);
      expect(settled.acceptedRowLookups).toBe(5);
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
      // The accepted path and publisher trust's own reconstruction: a
      // reinstall reconstructs nothing it could share.
      expect(settled.acceptedRowLookups).toBe(3);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
