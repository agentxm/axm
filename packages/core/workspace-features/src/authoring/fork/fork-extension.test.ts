import * as fs from "node:fs";
import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { FileSystemRecorder, type RecordedFileSystemCall } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { applyExecution, makeAuthoringWorkspace } from "../test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { ForkExtension } from "./fork-extension.js";

describe("ForkExtension prepared work", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  type ForkedType = "rule" | "hook" | "subagent" | "knowledge";

  const workspaceWith = (type: ForkedType) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
    const source = writeAuthoringPackage(created.root, authoringTypeFor(type), "original");
    return { created, source };
  };

  /** The recorded calls and `axm.hash.package` executions of one measured effect. */
  const measure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const value = yield* work.provide(effect);
      return {
        value,
        calls: recording.calls(),
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
      };
    });

  /** The staged package a fork preparation wrote into its private staging root. */
  const stagedPackageOf = (calls: ReadonlyArray<RecordedFileSystemCall>) => {
    const root = calls.find(
      (call) =>
        call.method === "makeTempDirectoryScoped" &&
        call.outcome === "success" &&
        nodePath.basename(call.path).startsWith("axm-fork-"),
    );
    if (root === undefined) throw new Error("The fork staged no package");
    return nodePath.join(root.path, "package");
  };

  /** Prepare a fork, run `between` on its staged package, then apply it; each phase measured. */
  const forkPhases = (
    type: ForkedType,
    source: string,
    options: { readonly enable: boolean; readonly between?: (staged: string) => void },
  ) =>
    Effect.gen(function* () {
      const prepare = yield* measure(
        ForkExtension.prepare({
          source,
          target: `@acme/${authoringTypeFor(type).plural}/custom`,
          from: Option.none(),
          enable: options.enable,
          nonInteractive: true,
        }),
      );
      const staged = stagedPackageOf(prepare.calls);
      options.between?.(staged);
      const apply = yield* measure(ForkExtension.previewOrApply(prepare.value, applyExecution));
      return { prepare, apply, staged };
    }).pipe(Effect.scoped);

  const stagedCounts = (
    phase: { readonly calls: ReadonlyArray<RecordedFileSystemCall>; readonly hashes: number },
    staged: string,
    files: ReadonlyArray<string>,
  ) => ({
    hashes: phase.hashes,
    rootReadDirectory: phase.calls.filter(
      (call) => call.method === "readDirectory" && call.path === staged,
    ).length,
    readFile: files.map(
      (file) =>
        phase.calls.filter(
          (call) => call.method === "readFile" && call.path === nodePath.join(staged, file),
        ).length,
    ),
  });

  // Measured before preparation reused its own staged hash: preparing hashed
  // the staged package twice (the pinned hash and the native preflight's),
  // and the lock hashes it once more in its fresh preflight.
  const before = {
    rule: {
      files: ["rule.json", "src/RULE.md"],
      prepare: { hashes: 2, rootReadDirectory: 2, readFile: [4, 3] },
      apply: { hashes: 4, rootReadDirectory: 8, readFile: [3, 2] },
    },
    hook: {
      files: ["hook.json"],
      prepare: { hashes: 3, rootReadDirectory: 4, readFile: [6] },
      apply: { hashes: 6, rootReadDirectory: 10, readFile: [5] },
    },
  } as const;

  // The HookManager frames a prepared hook package's tree integrity and
  // content hash from one walk and one read of each file.
  const sharedTreeWalk = { rule: 0, hook: 1 } as const;
  // Each preflight run's manager prepares from the manifest that run decoded,
  // so its own read of the staged manifest goes in each phase.
  const sharedManifestDecode = { rule: [1, 0], hook: [1] } as const;
  // Each preflight run's HookManager takes that run's package hash for the
  // staged root instead of framing its own.
  const sharedPackageHash = { rule: 0, hook: 1 } as const;
  // The canonical copy under the lock resolves the staged root once for all of
  // its overlap checks, so it lists that root three fewer times.
  const sharedCopyRootResolution = 3;
  // The preparing preflight decodes the manifest text the fork just wrote to
  // the staged package instead of reading it back; the lock's reads it fresh.
  const writtenManifestText = { rule: [1, 0], hook: [1] } as const;

  for (const type of ["rule", "hook"] as const)
    it.effect(`hashes an enabled ${type} fork's staged package once while preparing`, () => {
      const { created, source } = workspaceWith(type);
      const measured = before[type];
      const shared = sharedTreeWalk[type];
      const decoded = sharedManifestDecode[type];
      const hashed = sharedPackageHash[type];
      const written = writtenManifestText[type];
      return Effect.gen(function* () {
        const { prepare, apply, staged } = yield* forkPhases(type, source, { enable: true });
        expect(deriveOperationOutcome(apply.value)).toBe("applied");
        // The preflight no longer re-hashes the staged root, so its walk and
        // its read of every staged file go, and it decodes the manifest text
        // the fork wrote instead of reading the manifest.
        expect(stagedCounts(prepare, staged, measured.files)).toEqual({
          hashes: measured.prepare.hashes - 1 - hashed,
          rootReadDirectory: measured.prepare.rootReadDirectory - 1 - shared,
          readFile: measured.prepare.readFile.map(
            (count, index) => count - 1 - shared - (decoded[index] ?? 0) - (written[index] ?? 0),
          ),
        });
        // Under the lock the preflight reads and hashes the staged package
        // fresh; the install records the hash the transaction's own listing
        // computed for the forked package instead of hashing it again.
        expect(stagedCounts(apply, staged, measured.files)).toEqual({
          hashes: measured.apply.hashes - hashed - 1,
          rootReadDirectory: measured.apply.rootReadDirectory - shared - sharedCopyRootResolution,
          readFile: measured.apply.readFile.map(
            (count, index) => count - shared - (decoded[index] ?? 0),
          ),
        });
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
    });

  // Measured before the preparing preflight decoded the manifest text the
  // fork itself wrote: it read the staged manifest once more after the pinned
  // hash walk had read it. A Subagent's manager also reads it in its contained
  // package load, in both phases.
  const manifestReadsBefore = {
    subagent: { prepare: 3, apply: 3 },
    knowledge: { prepare: 2, apply: 2 },
  } as const;

  for (const type of ["subagent", "knowledge"] as const)
    it.effect(`reads an enabled ${type} fork's staged manifest once fewer while preparing`, () => {
      const { created, source } = workspaceWith(type);
      const manifest = authoringTypeFor(type).manifest;
      const measured = manifestReadsBefore[type];
      return Effect.gen(function* () {
        const { prepare, apply, staged } = yield* forkPhases(type, source, { enable: true });
        expect(deriveOperationOutcome(apply.value)).toBe("applied");
        // Preparing decodes the text the fork wrote instead of reading it
        // back; under the lock the preflight still reads it fresh.
        expect({
          prepare: stagedCounts(prepare, staged, [manifest]).readFile,
          apply: stagedCounts(apply, staged, [manifest]).readFile,
        }).toEqual({ prepare: [measured.prepare - 1], apply: [measured.apply] });
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
    });

  it.effect("reads a disabled rule fork's staged manifest only in its pinned hash walk", () => {
    const { created, source } = workspaceWith("rule");
    return Effect.gen(function* () {
      const { prepare, staged } = yield* forkPhases("rule", source, { enable: false });
      expect(stagedCounts(prepare, staged, ["rule.json", "src/RULE.md"])).toEqual({
        hashes: 1,
        rootReadDirectory: 1,
        readFile: [1, 1],
      });
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  // The fork writes the rewritten manifest through a contained link, and the
  // preparing preflight decodes exactly the text that landed behind it.
  it.effect("forks an enabled subagent whose manifest is a link to a package file", () => {
    const { created, source } = workspaceWith("subagent");
    const manifestPath = nodePath.join(source, "subagent.json");
    fs.renameSync(manifestPath, nodePath.join(source, "manifest-target.json"));
    fs.symlinkSync("manifest-target.json", manifestPath);
    return Effect.gen(function* () {
      let stagedLink = false;
      const { prepare, apply } = yield* forkPhases("subagent", source, {
        enable: true,
        between: (staged) => {
          stagedLink = fs.lstatSync(nodePath.join(staged, "subagent.json")).isSymbolicLink();
        },
      });
      const published = nodePath.join(created.root, "subagents", "custom");
      expect(stagedLink).toBe(true);
      expect(
        prepare.value.execution.materialPaths.map((path) => nodePath.relative(created.root, path)),
      ).toEqual([".claude/agents/custom.md", "axm.json", "axm.lock", "subagents/custom"]);
      expect(deriveOperationOutcome(apply.value)).toBe("applied");
      expect(fs.readlinkSync(nodePath.join(published, "subagent.json"))).toBe(
        "manifest-target.json",
      );
      expect(
        JSON.parse(fs.readFileSync(nodePath.join(published, "subagent.json"), "utf8")),
      ).toEqual({
        $schema: "https://axm.sh/schemas/subagent.schema.json",
        owner: "@acme",
        type: "subagent",
        name: "custom",
        version: "0.1.0",
        description: "The original subagent.",
        license: "MIT",
        core: { instructions: "src/original.md" },
      });
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  /** Apply a rule fork whose staged package `between` changed after preparation. */
  const refusedUnderLock = (between: (staged: string) => void) => {
    const { created, source } = workspaceWith("rule");
    const workspaceBefore = created.snapshot();
    return Effect.gen(function* () {
      const { apply } = yield* forkPhases("rule", source, { enable: true, between });
      expect(deriveOperationOutcome(apply.value)).toBe("failed");
      expect(created.snapshot()).toEqual(workspaceBefore);
      return apply.value.units.map((unit) => unit.error);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  };

  it.effect("refuses a staged identity rewritten after preparation under the lock", () =>
    Effect.gen(function* () {
      const errors = yield* refusedUnderLock((staged) => {
        const manifest = nodePath.join(staged, "rule.json");
        fs.writeFileSync(
          manifest,
          fs.readFileSync(manifest, "utf8").replace('"custom"', '"renamed"'),
        );
      });
      expect(errors).toMatchObject([
        {
          category: "validation",
          detail: "Prepared authored package identity does not match the requested identity",
        },
      ]);
    }),
  );

  // Root reads a file whatever its mode, so this case cannot make one unreadable there.
  it.effect.skipIf(process.getuid?.() === 0)(
    "reports a staged file made unreadable after preparation as a hash failure",
    () =>
      Effect.gen(function* () {
        let unreadable = "";
        const errors = yield* refusedUnderLock((staged) => {
          unreadable = nodePath.join(staged, "src/RULE.md");
          fs.chmodSync(unreadable, 0o000);
        });
        expect(errors).toMatchObject([
          {
            diagnostic: { kind: "package-content-hash-failed" },
            cause: {
              _tag: "PackageContentHashFailed",
              packageDir: nodePath.dirname(nodePath.dirname(unreadable)),
            },
          },
        ]);
      }),
  );

  it.effect("runs no native preflight for a disabled subagent fork", () => {
    const { created, source } = workspaceWith("subagent");
    const files = ["subagent.json", "src/original.md"];
    return Effect.gen(function* () {
      const { prepare, apply, staged } = yield* forkPhases("subagent", source, { enable: false });
      // Only the pinned hash of the staged package touches it while preparing.
      expect(stagedCounts(prepare, staged, files)).toEqual({
        hashes: 1,
        rootReadDirectory: 1,
        readFile: [1, 1],
      });
      expect(stagedCounts(apply, staged, files)).toEqual({
        hashes: 2,
        rootReadDirectory: 4,
        readFile: [0, 0],
      });
      expect(apply.value.units.map((unit) => unit.artifact)).toEqual([
        {
          path: "subagents/custom",
          scope: "project",
          version: "0.1.0",
          change: "created",
          targets: [
            { path: "subagents/custom", change: "created" },
            { path: "axm.json", change: "created" },
          ],
        },
      ]);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });
});
