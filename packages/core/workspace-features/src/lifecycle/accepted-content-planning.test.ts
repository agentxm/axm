/**
 * How often planning observes an accepted Registry Hook's package.
 *
 * Observing an accepted package hashes its whole tree. Within one planning
 * call, Hook install planning, Pack install and update planning, and their
 * acquisition settlement each decide from one observation of the package,
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
import { deriveOperationOutcome, type Plan } from "@agentxm/workspace-kernel/operations";
import { HookManager } from "@agentxm/workspace-kernel/materialization";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
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
import { applyActivation } from "./activation/test-helpers.js";
import { InstallExtensions } from "./index.js";
import { configuredUpdateRequest } from "./update/test-helpers.js";
import { UpdateExtensions } from "./update/update-extensions.js";

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

const packageHashes = (work: ReturnType<typeof workObservations>) =>
  work.facts.filter((fact) => fact.kind === "axm.hash.package").length;

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
    const root = canonicalHookRoot(installed);
    return {
      readiness: step?.readiness,
      agents: step?.artifact?.agents,
      treeHashes: treeHashes(work),
      packageHashes: packageHashes(work),
      manifestReads: recorder.recording.contentReads(nodePath.join(root, "hook.json")),
      scriptReads: recorder.recording.contentReads(nodePath.join(root, "src", "hook.sh")),
      rootListings: recorder.recording.calls({ path: root, method: "readDirectory" }).length,
    };
  });

describe("Hook install planning of an accepted Registry Hook", () => {
  it.effect("chooses the package root of a reinstall from one observation", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedHook;

      // The observation of the accepted package walks its tree once, and the
      // preparation takes that walk's digests and manifest decode; the
      // outcome evaluation still reads the manifest. Measured before the
      // preparation took them: treeHashes 2, manifestReads 6, scriptReads 2
      // and rootListings 3.
      expect(yield* replanAcceptedHook(installed)).toEqual({
        readiness: "ready",
        agents: ["claude-code"],
        treeHashes: 1,
        packageHashes: 1,
        manifestReads: 4,
        scriptReads: 1,
        rootListings: 2,
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
        packageHashes: 1,
        manifestReads: 3,
        scriptReads: 1,
        rootListings: 2,
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

  it.effect("prepares another version over an intact Hook from the fetched package", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedHook;
      // The later release binds a different event, so the projected binding
      // shows which release's manifest decode the preparation used.
      installed.registry.writeHook(HOOK, [
        { version: "1.0.0" },
        {
          version: "2.0.0",
          files: {
            "hook.json": JSON.stringify({
              owner: "@acme",
              type: "hook",
              name: HOOK,
              version: "2.0.0",
              description: `The ${HOOK} hook.`,
              implementations: [
                {
                  id: "claude-code",
                  protocol: "claude-code",
                  bindings: [
                    {
                      id: "release",
                      event: "PostToolUse",
                      handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
                    },
                  ],
                },
              ],
            }),
          },
        },
      ]);
      const releaseRequest = installRequest({
        type: "hook",
        subject: { kind: "source", source: `@acme/hooks/${HOOK}@2.0.0` },
      });
      const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const work = workObservations(false);

      const candidate = yield* installed.workspace
        .provide(InstallExtensions.prepare(releaseRequest).pipe(work.provide))
        .pipe(Effect.provideService(FileSystem.FileSystem, recorder.fileSystem));

      // The accepted row selects other content, so the preparation's
      // observation frames no package hash and lends no manifest decode.
      // Measured before: canonicalManifestReads 13, unchanged when the
      // preparation took its observation's decode; the two fewer reads are
      // the retained 1.0.0 contributor's selections framing its package hash
      // from their observations' walks.
      expect({
        treeHashes: treeHashes(work),
        packageHashes: packageHashes(work),
        canonicalManifestReads: recorder.recording.contentReads(
          nodePath.join(canonicalHookRoot(installed), "hook.json"),
        ),
      }).toEqual({ treeHashes: 6, packageHashes: 3, canonicalManifestReads: 11 });
      expect(candidate.execution.plan.jobs[0]?.steps[0]?.artifact?.version).toBe("2.0.0");

      // The Hook preparation of the release, beside the intact 1.0.0 package,
      // projects the fetched release's manifest decode, not the one its
      // observation made of the accepted package.
      const prepared = yield* installed.workspace.provide(
        Effect.scoped(
          Effect.gen(function* () {
            const accepted = yield* acceptedLockedResolutionRef({ type: "hook", name: HOOK });
            if (Option.isNone(accepted) || accepted.value.type !== "hook")
              return yield* Effect.die("The Hook was not accepted");
            const [release] = yield* (yield* SourceHostProviders).find(accepted.value.source, {
              names: [HOOK],
              type: "hook",
              owner: Option.none(),
              versionRange: Option.some("2.0.0"),
            });
            if (release?.type !== "hook") return yield* Effect.die("The release was not found");
            return yield* (yield* HookManager).prepareProjection([release]);
          }),
        ),
      );
      expect(
        prepared.agentOutcomes.flatMap(
          (outcome) => outcome.hook?.bindings.map(({ id, event }) => ({ id, event })) ?? [],
        ),
      ).toEqual([{ id: "release", event: "PostToolUse" }]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

const packRequest = installRequest({
  type: "pack",
  subject: { kind: "source", source: "@acme/packs/toolkit" },
});

/** A workspace that accepted Packs whose only members are Registry Hooks. */
const acceptedPacks = (packs: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const installed = world();
    for (const [pack, hook] of Object.entries(packs)) {
      installed.registry.writeHook(hook, [{ version: "1.0.0" }]);
      installed.registry.writePack(pack, [
        { version: "1.0.0", dependencies: { [`@acme/hooks/${hook}`]: "^1.0.0" } },
      ]);
      const applied = yield* installed.workspace.provide(
        applyInstallAcceptingExecutionChanges(
          installRequest({
            type: "pack",
            subject: { kind: "source", source: `@acme/packs/${pack}` },
          }),
        ),
      );
      expect(deriveOperationOutcome(applied)).toBe("applied");
    }
    return installed;
  });

const acceptedPack = acceptedPacks({ toolkit: HOOK });

/** Every planned step's acquisitions, and whether any step still carries planning observations. */
const acquisitionsOf = (plan: Plan<unknown>) => {
  const steps = plan.jobs.flatMap((job) => job.steps);
  return {
    acquisitions: steps.flatMap((step) =>
      (step.acquisitionRefs ?? []).map((ref) => `${ref.type}:${ref.name}`),
    ),
    carriesObservations: steps.some((step) => "acceptedContent" in step),
  };
};

/** Prepare the Pack install again, counting only the preparation's tree hashes. */
const reprepare = (installed: InstallWorld) =>
  Effect.gen(function* () {
    const work = workObservations(false);
    const candidate = yield* installed.workspace.provide(
      InstallExtensions.prepare(packRequest).pipe(work.provide),
    );
    return { ...acquisitionsOf(candidate.execution.plan), treeHashes: treeHashes(work) };
  });

describe("Pack install planning of an accepted Registry Hook member", () => {
  it.effect("decides that an intact member is reused from the Hook preparation's observation", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedPack;

      // The Hook preparation takes its observation's walk of the intact
      // member; measured before: 8.
      expect(yield* reprepare(installed)).toEqual({
        acquisitions: [],
        carriesObservations: false,
        treeHashes: 7,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("settles a drifted member's acquisition from one observation", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedPack;
      drift(installed);

      expect(yield* reprepare(installed)).toEqual({
        acquisitions: [`hook:${HOOK}`],
        carriesObservations: false,
        treeHashes: 8,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // The Hook preparation leaves a disabled member out, so the Pack plan
  // observes that member itself, and settlement of a drifted member decides
  // from that observation: both cases hash the same number of trees.
  it.effect.each([
    { label: "an intact", drifted: false, acquisitions: [], treeHashes: 4 },
    { label: "a drifted", drifted: true, acquisitions: [`hook:${HOOK}`], treeHashes: 4 },
  ])("observes $label disabled member once for its acquisition decision", (example) =>
    Effect.gen(function* () {
      const installed = yield* acceptedPack;
      const disabled = yield* installed.workspace.provide(
        applyActivation({ type: "hook", name: HOOK, enabled: false }),
      );
      expect(disabled._tag === "Resolved" ? disabled.outcome : disabled._tag).toBe("applied");
      if (example.drifted) drift(installed);

      expect(yield* reprepare(installed)).toEqual({
        acquisitions: example.acquisitions,
        carriesObservations: false,
        treeHashes: example.treeHashes,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

/** Publish a later release of each Pack with the same Hook member. */
const advancePacks = (installed: InstallWorld, packs: Readonly<Record<string, string>>) => {
  for (const [pack, hook] of Object.entries(packs))
    installed.registry.writePack(pack, [
      { version: "1.0.0", dependencies: { [`@acme/hooks/${hook}`]: "^1.0.0" } },
      { version: "1.1.0", dependencies: { [`@acme/hooks/${hook}`]: "^1.0.0" } },
    ]);
};

/** Prepare a configured Pack update, counting only the preparation's tree hashes. */
const prepareUpdate = (installed: InstallWorld, reinstall = false) =>
  Effect.gen(function* () {
    const work = workObservations(false);
    const candidate = yield* installed.workspace.provide(
      UpdateExtensions.prepare(configuredUpdateRequest({ type: "pack", reinstall })).pipe(
        work.provide,
      ),
    );
    if (candidate.outcome !== "planned") return yield* Effect.die("The update planned nothing");
    return { ...acquisitionsOf(candidate.execution.plan), treeHashes: treeHashes(work) };
  });

describe("Pack update planning of an unchanged Registry Hook member", () => {
  it.effect("decides that the member is reused from the Hook preparation's observation", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedPack;
      advancePacks(installed, { toolkit: HOOK });

      // Measured before the Hook preparation took its observation's walk: 5.
      expect(yield* prepareUpdate(installed)).toEqual({
        acquisitions: ["pack:toolkit"],
        carriesObservations: false,
        treeHashes: 4,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("decides each updated Pack's members from its own plan's observations", () =>
    Effect.gen(function* () {
      const packs = { toolkit: HOOK, kit: "lint" };
      const installed = yield* acceptedPacks(packs);
      advancePacks(installed, packs);

      // Measured before each Hook preparation took its observation's walk: 18.
      expect(yield* prepareUpdate(installed)).toEqual({
        acquisitions: ["pack:toolkit", "pack:kit"],
        carriesObservations: false,
        treeHashes: 14,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("still observes every member a reinstall acquires", () =>
    Effect.gen(function* () {
      const installed = yield* acceptedPack;

      // Measured before the Hook preparation took its observation's walk: 6.
      expect(yield* prepareUpdate(installed, true)).toEqual({
        acquisitions: ["pack:toolkit", `hook:${HOOK}`],
        carriesObservations: false,
        treeHashes: 5,
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
