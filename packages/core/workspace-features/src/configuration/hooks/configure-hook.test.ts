/**
 * Hook configuration hashes the configured package once per validity boundary:
 * preparation hands its hash to the hook manager's projection, and the locked
 * transition hands the hash it computed for its stale-content recheck to the
 * projection it runs under the same lock.
 *
 * Counts are exact for these fixtures. Hashing a package reads each of its
 * files once, so one hash fewer reads `src/hook.sh` once fewer.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { HookManager } from "@agentxm/workspace-kernel/materialization";
import { applyPlanExecution, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { observeObservedPlans } from "@agentxm/workspace-kernel/projection";
import { computePackageContentHash } from "@agentxm/workspace-kernel/workspace-state";

import { ConfigureHook } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";
import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SETTINGS = ".claude/settings.json";

const EDITED_SCRIPT = "exit 1\n";

/**
 * Platform services whose filesystem rewrites `script` once, as soon as the
 * armed apply creates its rollback snapshot directory. The transaction creates
 * that directory after candidate freshness has passed and before the
 * transition runs, so the edit reaches only the locked recheck. It stands in
 * for a foreign edit at that point; it cannot establish timing of a real one.
 */
const editsScriptAtRollbackSnapshot = (script: string) => {
  let armed = false;
  let edited = false;
  const layer = Layer.provideMerge(
    Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const base = yield* FileSystem.FileSystem;
        return FileSystem.make({
          ...base,
          makeTempDirectory: (options) =>
            base.makeTempDirectory(options).pipe(
              Effect.tap((directory) =>
                armed && nodePath.basename(directory).startsWith("axm-rollback-")
                  ? Effect.sync(() => {
                      armed = false;
                      fs.writeFileSync(script, EDITED_SCRIPT);
                      edited = true;
                    })
                  : Effect.void,
              ),
            ),
        });
      }),
    ).pipe(Layer.provide(NodeFileSystem.layer)),
    NodeServices.layer,
  );
  return {
    layer,
    arm: Effect.sync(() => {
      armed = true;
    }),
    edited: () => edited,
  };
};

/**
 * Platform services whose filesystem rewrites `manifestPath` once, right after
 * the `reads`-th content read of `script` that follows the rollback snapshot
 * directory of the apply armed with `arm`. Under the lock the locked observation's tree
 * check reads the script first and the locked recheck's hash second, so the
 * second read places the edit after the locked recheck and before the locked
 * projection's contributor observation.
 */
const rewritesManifestAfterScriptRead = (args: {
  readonly script: string;
  readonly manifestPath: string;
  readonly reads: number;
  readonly text: string;
}) => {
  let pending = false;
  let armed = false;
  let seen = 0;
  let rewritten = false;
  const layer = Layer.provideMerge(
    Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const base = yield* FileSystem.FileSystem;
        return FileSystem.make({
          ...base,
          makeTempDirectory: (options) =>
            base.makeTempDirectory(options).pipe(
              Effect.tap((directory) =>
                Effect.sync(() => {
                  if (pending && nodePath.basename(directory).startsWith("axm-rollback-")) {
                    pending = false;
                    armed = true;
                  }
                }),
              ),
            ),
          readFile: (file) =>
            base.readFile(file).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (!armed || file !== args.script) return;
                  seen += 1;
                  if (seen < args.reads) return;
                  armed = false;
                  fs.writeFileSync(args.manifestPath, args.text);
                  rewritten = true;
                }),
              ),
            ),
        });
      }),
    ).pipe(Layer.provide(NodeFileSystem.layer)),
    NodeServices.layer,
  );
  return {
    layer,
    arm: Effect.sync(() => {
      pending = true;
    }),
    rewritten: () => rewritten,
  };
};

const manifest = JSON.stringify({
  owner: "@acme",
  type: "hook",
  name: "audit",
  version: "1.0.0",
  configuration: { label: { type: "string", default: "original" } },
  implementations: [
    {
      id: "claude",
      protocol: "claude-code",
      bindings: [
        {
          id: "audit",
          event: "PreToolUse",
          handler: {
            type: "command",
            runtime: "bash",
            entrypoint: "src/hook.sh",
            args: [{ config: "label" }],
          },
        },
      ],
    },
  ],
});

type Resolution = Effect.Success<ReturnType<typeof ConfigureHook.previewOrApply>>;
type Snapshot = Readonly<Record<string, string>>;

/** The locked recheck's refusal, with nothing written beyond the foreign edit itself. */
const expectLockedRecheckRefusal = (
  resolution: Resolution,
  snapshots: { readonly before: Snapshot; readonly after: Snapshot },
  edited: { readonly script: string; readonly entry: string },
) => {
  expect(deriveOperationOutcome(resolution)).toBe("failed");
  expect(resolution.units).toMatchObject([{ state: "failed", disposition: "restored" }]);
  expect(resolution.failure).toMatchObject({
    cause: {
      detail: "Hook extension configuration could not settle",
      cause: {
        cause: {
          detail:
            "Hook extension content or configuration changed after preview; prepare the change again",
        },
      },
    },
  });
  expect(fs.readFileSync(edited.script, "utf8")).toBe(EDITED_SCRIPT);
  expect(snapshots.after).toEqual({
    ...snapshots.before,
    [edited.entry]: snapshots.after[edited.entry],
  });
};

const acceptingExecutionChanges = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-execution-changes"]),
  recovery: { command: ["hooks", "configure"], arguments: [] },
});

const packageHashes = (facts: ReadonlyArray<{ readonly kind: string }>) =>
  facts.filter((fact) => fact.kind === "axm.hash.package").length;

/** A workspace with Registry-sourced hooks installed, so preparation runs the exposure review. */
const installedHooks = (names: ReadonlyArray<string>) => {
  const world = makeInstallWorld();
  world.registry.writeHook("audit", [{ version: "1.0.0", files: { "hook.json": manifest } }]);
  for (const name of names.filter((name) => name !== "audit"))
    world.registry.writeHook(name, [{ version: "1.0.0" }]);
  const packageRoot = (name: string) =>
    nodePath.join(world.workspace.root, fileRegistryPackagePath(world.registry, "hooks", name));
  const install = Effect.forEach(names, (name) =>
    applyInstallAcceptingExecutionChanges(
      installRequest({
        type: "hook",
        subject: { kind: "source", source: `@acme/hooks/${name}@1.0.0` },
      }),
    ).pipe(
      Effect.tap((installed) =>
        Effect.sync(() => expect(deriveOperationOutcome(installed)).toBe("applied")),
      ),
    ),
  );
  return { world, packageRoot, install };
};

describe("Hook configuration hashes the configured package once per boundary", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "hands the prepared hash to preparation's projection and the locked hash to the locked projection",
    () => {
      const { world, packageRoot, install } = installedHooks(["audit"]);
      cleanups.push(world.cleanup);
      const script = nodePath.join(packageRoot("audit"), "src/hook.sh");
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install;
            const recording = yield* FileSystemRecorder;

            recording.reset();
            const prepareWork = workObservations(false);
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "counted" },
            }).pipe(prepareWork.provide);
            const prepared = {
              hashes: packageHashes(prepareWork.facts),
              scriptReads: recording.contentReads(script),
            };

            recording.reset();
            const applyWork = workObservations(false);
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            ).pipe(applyWork.provide);
            const applied = {
              hashes: packageHashes(applyWork.facts),
              scriptReads: recording.contentReads(script),
            };

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            const native = world.workspace.readFile(SETTINGS);
            expect(native).toContain("counted");
            expect(native).not.toContain("original");
            // The manager hashed the configured package again in each
            // projection: 4 hashes and 13 script reads in preparation, 2 and 5
            // under the lock. Each retained selection now frames its hash
            // from its observation's walk: 10 script reads in preparation
            // before.
            expect({ prepared, applied }).toEqual({
              prepared: { hashes: 3, scriptReads: 8 },
              applied: { hashes: 1, scriptReads: 4 },
            });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "decodes the hook manifest each canonical observation read instead of reading it again",
    () => {
      const { world, packageRoot, install } = installedHooks(["audit"]);
      cleanups.push(world.cleanup);
      const hookManifest = nodePath.join(packageRoot("audit"), "hook.json");
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install;
            const recording = yield* FileSystemRecorder;

            recording.reset();
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "counted" },
            });
            const prepared = recording.contentReads(hookManifest);

            recording.reset();
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            );
            const applied = recording.contentReads(hookManifest);

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(world.workspace.readFile(SETTINGS)).toContain("counted");
            // The feature read the manifest again after its observation, and
            // the manager after the contributor observation of each of the
            // three projections in preparation and the one under the lock:
            // 22 reads in preparation and 7 in apply. Observations, hashes
            // and tree checks still read it; a retained selection's hash now
            // comes from its observation's walk (15 in preparation before).
            expect({ prepared, applied }).toEqual({ prepared: 13, applied: 6 });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "refuses package content edited after preparation without writing",
    () => {
      const { world, packageRoot, install } = installedHooks(["audit"]);
      cleanups.push(world.cleanup);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install;
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "replacement" },
            });
            fs.writeFileSync(nodePath.join(packageRoot("audit"), "src/hook.sh"), "exit 1\n");
            const before = world.workspace.snapshot();
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            );
            // Candidate freshness sees the edit before the locked recheck runs.
            expect(deriveOperationOutcome(resolution)).toBe("blocked");
            expect(resolution.blocking).toMatchObject({
              class: "stale-candidate",
              phase: "validation",
              detail: "The execution candidate became stale before apply.",
            });
            expect(world.workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "refuses installed package content edited under the lock after candidate freshness without writing",
    () => {
      const { world, packageRoot, install } = installedHooks(["audit"]);
      cleanups.push(world.cleanup);
      const script = nodePath.join(packageRoot("audit"), "src/hook.sh");
      const edit = editsScriptAtRollbackSnapshot(script);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install;
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "replacement" },
            });
            const before = world.workspace.snapshot();
            yield* edit.arm;
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            );
            // The edit landed between candidate freshness and the transition. The
            // installed package no longer matches its locked tree, so the locked
            // canonical observation is the part of the recheck that refuses.
            expect(edit.edited()).toBe(true);
            expectLockedRecheckRefusal(
              resolution,
              { before, after: world.workspace.snapshot() },
              { script, entry: nodePath.relative(world.workspace.root, script) },
            );
          }),
        )
        .pipe(Effect.provide(edit.layer));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "refuses workspace package content edited under the lock through the locked content recheck",
    () => {
      const world = makeConfigurationFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          hooks: { audit: { source: "workspace", enabled: true } },
        },
        files: { "hooks/audit/hook.json": manifest, "hooks/audit/src/hook.sh": "exit 0\n" },
      });
      cleanups.push(world.cleanup);
      const script = nodePath.join(world.root, "hooks/audit/src/hook.sh");
      const edit = editsScriptAtRollbackSnapshot(script);
      return world
        .provide(
          Effect.gen(function* () {
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "replacement" },
            });
            const before = world.snapshot();
            yield* edit.arm;
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            );
            // A workspace package has no locked tree, so only the locked content
            // hash compare sees the edit.
            expect(edit.edited()).toBe(true);
            expectLockedRecheckRefusal(
              resolution,
              { before, after: world.snapshot() },
              { script, entry: "hooks/audit/src/hook.sh" },
            );
          }),
        )
        .pipe(Effect.provide(edit.layer));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "hashes a disabled hook only for the feature's own stale-content record",
    () => {
      const world = makeConfigurationFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          hooks: { audit: { source: "workspace", enabled: false } },
        },
        files: { "hooks/audit/hook.json": manifest, "hooks/audit/src/hook.sh": "exit 0\n" },
      });
      cleanups.push(world.cleanup);
      return world
        .provide(
          Effect.gen(function* () {
            const prepareWork = workObservations(false);
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "configured" },
            }).pipe(prepareWork.provide);
            const applyWork = workObservations(false);
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            ).pipe(applyWork.provide);
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect({
              prepared: packageHashes(prepareWork.facts),
              applied: packageHashes(applyWork.facts),
            }).toEqual({ prepared: 1, applied: 1 });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "uses a handed hash only for its exact package root and hashes every other contributor itself",
    () => {
      const { world, packageRoot, install } = installedHooks(["audit", "retained"]);
      cleanups.push(world.cleanup);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install;
            const hooks = yield* HookManager;
            const recording = yield* FileSystemRecorder;
            const observe = (
              preparedContentHashes?: ReadonlyMap<
                string,
                { readonly packageRoot: string; readonly contentHash: string }
              >,
            ) =>
              Effect.gen(function* () {
                recording.reset();
                const work = workObservations(false);
                const observations = yield* hooks
                  .observedProjectionPlans(
                    preparedContentHashes === undefined ? undefined : { preparedContentHashes },
                    observeObservedPlans,
                  )
                  .pipe(work.provide);
                return {
                  observations,
                  hashes: packageHashes(work.facts),
                  auditReads: recording.contentReads(
                    nodePath.join(packageRoot("audit"), "src/hook.sh"),
                  ),
                  retainedReads: recording.contentReads(
                    nodePath.join(packageRoot("retained"), "src/hook.sh"),
                  ),
                };
              });
            const computed = yield* observe();
            const contentHash = yield* computePackageContentHash(packageRoot("audit"));
            const handed = yield* observe(
              new Map([["audit", { packageRoot: packageRoot("audit"), contentHash }]]),
            );
            const elsewhere = yield* observe(
              new Map([
                ["audit", { packageRoot: `${packageRoot("audit")}/`, contentHash: "unrelated" }],
              ]),
            );

            // Each contributor's script is read once by its observation's
            // strict walk, which frames the hash of a contributor nothing was
            // handed for; a hash handed for another root is computed apart.
            // Measured before the walk framed it: 2, 2 and 2 reads each.
            expect(computed).toMatchObject({ hashes: 2, auditReads: 1, retainedReads: 1 });
            expect(handed).toMatchObject({ hashes: 1, auditReads: 1, retainedReads: 1 });
            expect(elsewhere).toMatchObject({ hashes: 2, auditReads: 2, retainedReads: 1 });
            // The handed hash renders the same observation the manager's own does.
            expect(handed.observations).toEqual(computed.observations);
            expect(elsewhere.observations).toEqual(computed.observations);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );
  it.effect(
    "fails through the locked contributor observation when the manifest is rewritten after the locked recheck",
    () => {
      const { world, packageRoot, install } = installedHooks(["audit"]);
      cleanups.push(world.cleanup);
      const manifestPath = nodePath.join(packageRoot("audit"), "hook.json");
      const rewritten = manifest.replace('"original"', '"rewritten"');
      const edit = rewritesManifestAfterScriptRead({
        script: nodePath.join(packageRoot("audit"), "src/hook.sh"),
        manifestPath,
        reads: 2,
        text: rewritten,
      });
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* install;
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "replacement" },
            });
            const before = world.workspace.snapshot();
            yield* edit.arm;
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            );
            // The installed package no longer matches its locked tree, so the
            // contributor's own live observation refuses the projection; the
            // manifest it read is never decoded into native output.
            expect(edit.rewritten()).toBe(true);
            expect(deriveOperationOutcome(resolution)).toBe("failed");
            expect(resolution.units).toMatchObject([{ state: "failed", disposition: "restored" }]);
            expect(resolution.failure).toMatchObject({
              cause: {
                detail: "Hook extension configuration could not settle",
                cause: { cause: { _tag: "ContributorTreeMismatch" } },
              },
            });
            const entry = nodePath.relative(world.workspace.root, manifestPath);
            const after = world.workspace.snapshot();
            expect(fs.readFileSync(manifestPath, "utf8")).toBe(rewritten);
            expect(after).toEqual({ ...before, [entry]: after[entry] });
          }),
        )
        .pipe(Effect.provide(edit.layer));
    },
    { timeout: 60_000 },
  );

  for (const corrupt of [
    { label: "an excess key", text: JSON.stringify({ ...JSON.parse(manifest), fallback: "auto" }) },
    { label: "invalid JSON", text: "{not json" },
  ]) {
    it.effect(
      `refuses a workspace hook whose manifest has ${corrupt.label} before reading it again`,
      () => {
        const world = makeConfigurationFixture({
          settings: {
            owner: "@acme",
            agents: ["claude-code"],
            hooks: { audit: { source: "workspace", enabled: true } },
          },
          files: { "hooks/audit/hook.json": corrupt.text, "hooks/audit/src/hook.sh": "exit 0\n" },
        });
        cleanups.push(world.cleanup);
        return world
          .provide(
            Effect.gen(function* () {
              const failure = yield* ConfigureHook.prepare({
                name: "audit",
                configuration: { label: "replacement" },
              }).pipe(Effect.flip);
              // The observation judges the manifest corrupt, so the package is
              // not usable and nothing decodes it.
              expect(failure).toMatchObject({
                detail: "Hook extension audit has no installed package to configure",
              });
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
      { timeout: 60_000 },
    );
  }
});
