import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

import { makeRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  DesiredStateReader,
  LockfileReader,
  WorkspaceLocation,
  observeInstallRoot,
} from "@agentxm/workspace-kernel/workspace-state";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import { afterEach } from "vitest";

import {
  seedAcceptedRegistryResolution,
  SPEC_REGISTRY_SOURCE,
} from "../test-support/accepted-resolutions.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { AdoptExtension } from "./adopt-extension.js";

const ACQUIRED = "agent_extensions/registry.example.com/@acme";

/** Each example prepares and applies against a real workspace and its agent projections. */
const TIMEOUT = 120_000;

/** A mode 000 file stays readable to root, and Windows ignores the mode. */
const unreadableUnenforced = process.getuid?.() === 0 || process.platform === "win32";

interface Adoption {
  readonly type: "rule" | "skill";
  readonly mode: "move" | "in-place";
  readonly enabled: boolean;
}

interface PhaseCounts {
  /** `readFile` calls on the adopted package's manifest. */
  readonly manifestReads: number;
  /** `readDirectory` calls on the adopted package's root: one per tree hash or snapshot. */
  readonly packageRootListings: number;
  /** `axm.hash.package` work facts in the phase. */
  readonly packageHashes: number;
  /** `readDirectory` calls anywhere under the install root. */
  readonly installRootListings: number;
}

describe("Adopt reads the adopted package once per validity boundary", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    return created;
  };

  /**
   * Write the adopted package where its mode finds it, and an unrelated
   * accepted Skill that keeps the install root non-empty, so an install-root
   * inventory performs a real walk.
   */
  const arrange = (created: AuthoringWorkspace, adopted: Adoption) =>
    Effect.gen(function* () {
      const row = authoringTypeFor(adopted.type);
      const packageRoot = writeAuthoringPackage(created.root, row, "review", {
        parent: adopted.mode === "in-place" ? row.plural : `${ACQUIRED}/${row.plural}`,
      });
      writeAuthoringPackage(created.root, authoringTypeFor("skill"), "helper", {
        parent: `${ACQUIRED}/skills`,
      });
      const declared = adopted.enabled
        ? {}
        : { review: { source: `@acme/${row.plural}/review`, enabled: false } };
      created.writeSettings({
        owner: "@acme",
        agents: ["claude-code"],
        sources: [SPEC_REGISTRY_SOURCE],
        skills: { helper: "@acme/skills/helper", ...(adopted.type === "skill" ? declared : {}) },
        ...(adopted.type === "skill" ? {} : { [row.settingsKey]: declared }),
      });
      yield* seedAcceptedRegistryResolution({
        type: "skill",
        owner: "@acme",
        name: "helper",
        version: "2.3.4",
      });
      if (adopted.mode === "move")
        yield* seedAcceptedRegistryResolution({
          type: adopted.type,
          owner: "@acme",
          name: "review",
          version: "1.2.3",
        });
      return { row, packageRoot, fqn: `@acme/${row.plural}/review` };
    });

  /** Prepare and apply one adoption, counting each phase separately. */
  const measureAdopt = (created: AuthoringWorkspace, adopted: Adoption) =>
    Effect.gen(function* () {
      const { row, packageRoot, fqn } = yield* arrange(created, adopted);
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const work = workObservations(false);
      const installRoot = nodePath.join(created.root, "agent_extensions");
      const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(Effect.provideService(FileSystem.FileSystem, fileSystem), work.provide);
      const counts = (): PhaseCounts => ({
        manifestReads: recording.calls({
          path: nodePath.join(packageRoot, row.manifest),
          method: "readFile",
        }).length,
        packageRootListings: recording.calls({ path: packageRoot, method: "readDirectory" }).length,
        packageHashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
        installRootListings: recording
          .calls({ method: "readDirectory" })
          .filter(
            (call) =>
              call.path === installRoot || call.path.startsWith(`${installRoot}${nodePath.sep}`),
          ).length,
      });

      // One install-root inventory, observed directly on the same fixture.
      const location = yield* WorkspaceLocation;
      const layout = yield* Ref.get(location.layout);
      const graph = yield* (yield* DesiredStateReader).graph();
      const locks = yield* LockfileReader;
      recording.reset();
      yield* observed(observeInstallRoot({ layout, graph, locks }));
      const inventoryListings = counts().installRootListings;

      recording.reset();
      work.facts.splice(0);
      const candidate = yield* observed(AdoptExtension.prepare({ fqn, nonInteractive: true }));
      const prepare = counts();

      recording.reset();
      work.facts.splice(0);
      yield* observed(AdoptExtension.previewOrApply(candidate, applyExecution));
      const apply = counts();
      return { inventoryListings, prepare, apply };
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  it.effect(
    "adopts an enabled rule in place with one manifest read and one hash per phase",
    () =>
      Effect.gen(function* () {
        const measured = yield* measureAdopt(workspace(), {
          type: "rule",
          mode: "in-place",
          enabled: true,
        });

        // One inventory walks the root, its source directory, the owner and the
        // Skill directory.
        expect(measured.inventoryListings).toBe(4);
        // Prepare: one inventory; the manifest read and hash shared by the
        // resolution and the native preflight, plus the hash's own file read and
        // the rule manager's projection read.
        expect(measured.prepare).toEqual({
          installRootListings: 4,
          manifestReads: 3,
          packageRootListings: 1,
          packageHashes: 1,
        });
        // Apply: the in-lock preflight and resolution share one read and one
        // hash; the fresh inventory, snapshot and post-write resolution remain.
        expect(measured.apply).toEqual({
          installRootListings: 22,
          manifestReads: 11,
          packageRootListings: 4,
          packageHashes: 3,
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "moves an enabled rule with one manifest read and one hash under the lock",
    () =>
      Effect.gen(function* () {
        const measured = yield* measureAdopt(workspace(), {
          type: "rule",
          mode: "move",
          enabled: true,
        });

        // Prepare already read and hashed the acquired copy once.
        expect({ ...measured.prepare, installRootListings: undefined }).toEqual({
          installRootListings: undefined,
          manifestReads: 3,
          packageRootListings: 1,
          packageHashes: 1,
        });
        // Under the lock the preflight and the resolution share one read and one
        // hash of the acquired copy; the move's own hashes are unchanged.
        expect({ ...measured.apply, installRootListings: undefined }).toEqual({
          installRootListings: undefined,
          manifestReads: 5,
          packageRootListings: 3,
          packageHashes: 3,
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "adopts a skill in place with one install-root inventory in prepare",
    () =>
      Effect.gen(function* () {
        const measured = yield* measureAdopt(workspace(), {
          type: "skill",
          mode: "in-place",
          enabled: true,
        });

        expect(measured.inventoryListings).toBe(4);
        // A Skill has no native preflight demand: only the resolution reads it.
        expect(measured.prepare).toEqual({
          installRootListings: 4,
          manifestReads: 2,
          packageRootListings: 1,
          packageHashes: 1,
        });
        // Apply: the in-lock resolution is the only reader of the authored
        // Skill under the lock, so its fresh manifest read, presence and hash
        // remain beside the snapshot and the post-write resolution. The
        // read-only preflight before the lock shares one document view, so its
        // listing, presence check and prior graph share one install-root
        // inventory; each Skill listing resolves the authored Skill once, and
        // its accepted restoration reuses that resolution.
        expect(measured.apply).toEqual({
          installRootListings: 35,
          manifestReads: 4,
          packageRootListings: 15,
          packageHashes: 2,
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "moves a disabled skill without gaining package reads",
    () =>
      Effect.gen(function* () {
        const measured = yield* measureAdopt(workspace(), {
          type: "skill",
          mode: "move",
          enabled: false,
        });

        expect(measured.prepare).toEqual({
          installRootListings: 4,
          manifestReads: 0,
          packageRootListings: 0,
          packageHashes: 0,
        });
        // Each Skill listing resolves the moved authored copy once: the
        // accepted restoration reuses the listing's resolution instead of
        // hashing the package a second time.
        expect({ ...measured.apply, installRootListings: undefined }).toEqual({
          installRootListings: undefined,
          manifestReads: 4,
          packageRootListings: 3,
          packageHashes: 2,
        });
      }),
    TIMEOUT,
  );

  // Each refusal below is the one adoption produced before the package reads
  // were shared: the first check to observe a changed package still refuses.
  const outcomeOf = (
    created: AuthoringWorkspace,
    adopted: Adoption,
    edits: {
      readonly beforePrepare?: (packageRoot: string) => void;
      readonly beforeApply?: (packageRoot: string) => Effect.Effect<void, unknown> | void;
    },
  ) =>
    Effect.gen(function* () {
      const { packageRoot, fqn } = yield* arrange(created, adopted);
      edits.beforePrepare?.(packageRoot);
      const prepared = yield* AdoptExtension.prepare({ fqn, nonInteractive: true }).pipe(
        Effect.result,
      );
      if (prepared._tag === "Failure") return { phase: "prepare", error: prepared.failure };
      const between = edits.beforeApply?.(packageRoot);
      if (between !== undefined) yield* between;
      const resolution = yield* AdoptExtension.previewOrApply(prepared.success, applyExecution);
      return { phase: "apply", failure: resolution.failure, blocking: resolution.blocking };
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  const unreadable = (file: string) => {
    nodeFs.chmodSync(file, 0o000);
    cleanups.unshift(() => nodeFs.chmodSync(file, 0o644));
  };

  const breakManifest = (packageRoot: string) =>
    nodeFs.writeFileSync(nodePath.join(packageRoot, "rule.json"), "{ not a manifest");

  const enabledRule = (mode: Adoption["mode"]): Adoption => ({ type: "rule", mode, enabled: true });

  const staleCandidate = { class: "stale-candidate", phase: "validation" } as const;

  it.effect.skipIf(unreadableUnenforced)(
    "refuses an unreadable acquired file under the lock before the occupied destination",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("move"), {
          beforeApply: (packageRoot) => {
            unreadable(nodePath.join(packageRoot, "notes.txt"));
            created.write("rules/review/occupied.txt", "Someone else's work");
          },
        });

        // The moved material's fingerprint observes the unreadable file first.
        expect(outcome).toMatchObject({
          phase: "apply",
          failure: { _tag: "StepFailure", cause: { _tag: "CandidateFingerprintFailed" } },
        });
      }),
    TIMEOUT,
  );

  it.effect.skipIf(unreadableUnenforced)(
    "refuses an authored file made unreadable after in-place prepare at its snapshot",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforeApply: (packageRoot) => unreadable(nodePath.join(packageRoot, "notes.txt")),
        });

        expect(outcome).toMatchObject({
          phase: "apply",
          failure: { _tag: "StepFailure", cause: { cause: { _tag: "WorkspaceSnapshotError" } } },
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "refuses a declaration added after in-place prepare as a stale candidate",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforeApply: (packageRoot) => {
            unreadable(nodePath.join(packageRoot, "notes.txt"));
            created.writeSettings({
              owner: "@acme",
              agents: ["claude-code"],
              sources: [SPEC_REGISTRY_SOURCE],
              skills: { helper: "@acme/skills/helper" },
              rules: { review: "workspace" },
            });
          },
        });

        expect(outcome).toMatchObject({ phase: "apply", blocking: staleCandidate });
      }),
    TIMEOUT,
  );

  it.effect.skipIf(unreadableUnenforced)(
    "refuses an unreadable authored file in prepare as an invalid package",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforePrepare: (packageRoot) => unreadable(nodePath.join(packageRoot, "notes.txt")),
        });

        expect(outcome).toMatchObject({
          phase: "prepare",
          error: {
            _tag: "OperationRefused",
            category: "validation",
            detail:
              "The authored package at rules/review is not a valid @acme/rules/review package",
            cause: { _tag: "PackageContentHashFailed" },
          },
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "refuses a broken manifest in in-place prepare as an invalid package",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforePrepare: breakManifest,
        });

        expect(outcome).toMatchObject({
          phase: "prepare",
          error: {
            _tag: "OperationRefused",
            category: "validation",
            detail:
              "The authored package at rules/review is not a valid @acme/rules/review package",
            cause: { _tag: "WorkspaceSourceInvalid" },
          },
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "refuses a manifest broken after in-place prepare with the preflight's refusal",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforeApply: breakManifest,
        });

        expect(outcome).toMatchObject({
          phase: "apply",
          failure: {
            _tag: "StepFailure",
            category: "validation",
            detail: "Prepared authored package is not valid (validation)",
          },
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "refuses a manifest broken after move prepare as a stale candidate",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("move"), {
          beforeApply: breakManifest,
        });

        expect(outcome).toMatchObject({ phase: "apply", blocking: staleCandidate });
      }),
    TIMEOUT,
  );

  it.effect(
    "refuses a package whose identity was edited after in-place prepare",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforeApply: (packageRoot) => {
            const manifest = nodePath.join(packageRoot, "rule.json");
            const text = nodeFs.readFileSync(manifest, "utf-8");
            nodeFs.writeFileSync(manifest, text.replace('"@acme"', '"@other"'));
          },
        });

        expect(outcome).toMatchObject({
          phase: "apply",
          failure: {
            _tag: "StepFailure",
            detail:
              "Prepared authored package identity does not match the requested identity (validation)",
          },
        });
      }),
    TIMEOUT,
  );

  it.effect(
    "refuses an installed copy that appears after in-place prepare",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const outcome = yield* outcomeOf(created, enabledRule("in-place"), {
          beforeApply: () => {
            writeAuthoringPackage(created.root, authoringTypeFor("rule"), "review", {
              parent: `${ACQUIRED}/rules`,
            });
            return seedAcceptedRegistryResolution({
              type: "rule",
              owner: "@acme",
              name: "review",
              version: "1.2.3",
            }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
          },
        });

        expect(outcome).toMatchObject({ phase: "apply", blocking: staleCandidate });
      }),
    TIMEOUT,
  );
});
