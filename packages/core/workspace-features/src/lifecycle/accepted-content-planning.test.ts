/**
 * How often planning observes an accepted Registry Hook's package.
 *
 * Observing an accepted package hashes its whole tree. Within one planning
 * call, Hook install planning decides from one observation of the package,
 * so these examples count materialized-tree hashes of the planning alone in
 * real workspaces with a `file://` Registry.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { planHookInstall } from "@agentxm/extension-kinds/hooks";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
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
import { InstallExtensions } from "./index.js";

const HOOK = "guard";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const world = (): InstallWorld => {
  const created = makeInstallWorld();
  cleanups.push(created.cleanup);
  return created;
};

const canonicalHookRoot = (installed: InstallWorld, name = HOOK) =>
  nodePath.join(
    installed.workspace.root,
    fileRegistryPackagePath(installed.registry, "hooks", name),
  );

const drift = (installed: InstallWorld) =>
  fs.writeFileSync(nodePath.join(canonicalHookRoot(installed), "drift.txt"), "Local drift.\n");

const treeHashes = (work: ReturnType<typeof workObservations>) =>
  work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length;

const hookRequest = installRequest({
  type: "hook",
  subject: { kind: "source", source: `@acme/hooks/${HOOK}` },
});

/** A workspace that accepted the Registry Hook directly. */
const acceptedHook = Effect.gen(function* () {
  const installed = world();
  installed.registry.writeHook(HOOK, [{ version: "1.0.0" }]);
  const applied = yield* installed.workspace.provide(
    applyInstallAcceptingExecutionChanges(hookRequest),
  );
  expect(deriveOperationOutcome(applied)).toBe("applied");
  return installed;
});

/**
 * Plan installing the accepted Hook ref again inside one read phase, counting
 * only that planning's tree hashes and content reads of the accepted manifest.
 */
const replanAcceptedHook = (installed: InstallWorld) =>
  Effect.gen(function* () {
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const work = workObservations(false);
    const plan = yield* installed.workspace
      .provide(
        withWorkspaceReadView(
          Effect.gen(function* () {
            const accepted = yield* acceptedLockedResolutionRef({ type: "hook", name: HOOK });
            if (Option.isNone(accepted) || accepted.value.type !== "hook")
              return yield* Effect.die("The Hook was not accepted");
            const ref = accepted.value;
            recorder.recording.reset();
            return yield* planHookInstall({ refs: [{ ref, versionRange: Option.none() }] }).pipe(
              work.provide,
            );
          }),
        ),
      )
      .pipe(Effect.provideService(FileSystem.FileSystem, recorder.fileSystem));
    const step = plan.jobs[0]?.steps[0];
    return {
      readiness: step?.readiness,
      agents: step?.artifact?.agents,
      treeHashes: treeHashes(work),
      manifestReads: recorder.recording.contentReads(
        nodePath.join(canonicalHookRoot(installed), "hook.json"),
      ),
    };
  });

describe("Hook install planning of an accepted Registry Hook", () => {
  it.effect("chooses the package root of a reinstall from one observation", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedHook;

      // One hash observes the accepted package and one is the prepared
      // package's own digest; the outcome evaluation still reads the manifest.
      expect(yield* replanAcceptedHook(installed)).toEqual({
        readiness: "ready",
        agents: ["claude-code"],
        treeHashes: 2,
        manifestReads: 6,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fetches a drifted accepted Hook for both decisions from one observation", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedHook;
      drift(installed);

      expect(yield* replanAcceptedHook(installed)).toEqual({
        readiness: "ready",
        agents: ["claude-code"],
        treeHashes: 2,
        manifestReads: 3,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("observes no accepted package when the Hook is new", () =>
    Effect.gen(function* () {
      const installed = world();
      installed.registry.writeHook(HOOK, [{ version: "1.0.0" }]);
      const work = workObservations(false);

      yield* installed.workspace.provide(InstallExtensions.prepare(hookRequest).pipe(work.provide));

      expect(treeHashes(work)).toBe(2);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
