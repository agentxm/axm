import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";
import { readExtensionManifest, type ExtensionManifest } from "@agentxm/extension-content";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { parseFqn } from "@agentxm/extension-model/unstable/extensions";
import { FileSystemRecorder } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  HookManager,
  KnowledgeManager,
  RuleManager,
} from "@agentxm/workspace-kernel/materialization";
import { observeProjectionPlans } from "@agentxm/workspace-kernel/projection";
import {
  WorkspaceLocation,
  computeSourceHash,
  withLiveWorkspaceObservations,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";
import { CreateExtension } from "./create/create-extension.js";
import { preflightAuthoredNativeProjection, preparedManifestFacts } from "./native-projection.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "./test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "./test-support/recording-authoring-workspace.js";
import { writeMinimalPackage } from "../testing/local-packages.js";

/** A manifest a caller decoded for one package root, as a manager accepts it. */
interface PreparedManifestEntry {
  readonly packageRoot: string;
  readonly manifest: ExtensionManifest;
}

describe("authored native projection outcomes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const type of ["rule", "hook", "knowledge"] as const) {
    it.effect(`reports final native locations after creating a ${type}`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
        cleanups.push(created.cleanup);
        created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
        const resolution = yield* Effect.gen(function* () {
          const candidate =
            type === "rule"
              ? yield* CreateExtension.prepare({
                  type,
                  name: "review",
                  owner: Option.none(),
                  title: Option.none(),
                })
              : type === "knowledge"
                ? yield* CreateExtension.prepare({
                    type,
                    name: "review",
                    owner: Option.none(),
                    description: Option.none(),
                  })
                : yield* CreateExtension.prepare({
                    type,
                    name: "review",
                    owner: Option.none(),
                    runtime: "bash",
                    protocol: "claude-code",
                    event: "SessionStart",
                    matcher: Option.none(),
                  });
          return yield* CreateExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
        const nativeLocations = resolution.units.flatMap(
          (unit) => unit.artifact?.nativeLocations ?? [],
        );
        if (type === "hook") {
          expect(nativeLocations).toEqual([]);
          expect(created.exists(".claude/settings.json")).toBe(false);
          return;
        }
        expect(nativeLocations.length).toBeGreaterThan(0);
        expect(
          nativeLocations.every((location) => location.address.path.startsWith(`${created.root}/`)),
        ).toBe(true);
        expect(nativeLocations.some((location) => location.state === "created")).toBe(true);
        expect(
          nativeLocations
            .flatMap((location) => location.availability)
            .every((fact) => fact.state !== "verified"),
        ).toBe(true);
      }),
    );
  }
});

describe("authored native preflight inputs", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const plural = { rule: "rules", knowledge: "knowledge", hook: "hooks", subagent: "subagents" };
  const payload = {
    rule: "src/RULE.md",
    knowledge: "src/index.md",
    hook: "src/hook.sh",
    subagent: "src/review.md",
  };
  /** What a caller hands one preflight run besides the staged package. */
  type Inputs = "neither" | "hash" | "facts" | "factsAndHash" | "decoded" | "decodedAndHash";
  const inputs: ReadonlyArray<Inputs> = [
    "neither",
    "hash",
    "facts",
    "factsAndHash",
    "decoded",
    "decodedAndHash",
  ];
  // Content reads of the staged manifest during one preflight run. Without
  // inputs: the preflight's own manifest read and package hash, then the
  // manager's reads. A Rule, Hook or Knowledge manager prepares from the
  // manifest the run decoded, or a full decode its caller supplied, and reads
  // it itself only when handed bare facts. The HookManager's tree walk reads
  // the manifest once more. The Subagent manager loads its package once
  // through its contained loader.
  const manifestReads: Record<keyof typeof plural, Record<Inputs, number>> = {
    rule: { neither: 2, hash: 1, facts: 2, factsAndHash: 1, decoded: 1, decodedAndHash: 0 },
    knowledge: { neither: 2, hash: 1, facts: 2, factsAndHash: 1, decoded: 1, decodedAndHash: 0 },
    hook: { neither: 3, hash: 2, facts: 3, factsAndHash: 2, decoded: 2, decodedAndHash: 1 },
    subagent: { neither: 3, hash: 2, facts: 2, factsAndHash: 1, decoded: 2, decodedAndHash: 1 },
  };
  // Content reads of the staged payload: the preflight's package hash unless
  // one is supplied, plus the manager's one read.
  const payloadReads: Record<Inputs, number> = {
    neither: 2,
    hash: 1,
    facts: 2,
    factsAndHash: 1,
    decoded: 2,
    decodedAndHash: 1,
  };
  // `axm.hash.package` executions: the preflight's hash unless one is
  // supplied. The HookManager takes that same hash for the staged package
  // instead of framing its own.
  const hashes: Record<Inputs, number> = {
    neither: 1,
    hash: 0,
    facts: 1,
    factsAndHash: 0,
    decoded: 1,
    decodedAndHash: 0,
  };

  const stage = (type: keyof typeof plural) => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(workspace.cleanup);
    workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
    const stagingRoot = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-preflight-test-")),
    );
    cleanups.push(() => fs.rmSync(stagingRoot, { recursive: true, force: true }));
    const packageRoot = writeMinimalPackage(nodePath.join(stagingRoot, "review"), type, {
      name: "review",
      owner: "@acme",
    });
    return { workspace, packageRoot };
  };

  /** `calls` with the `nth` (from zero) successful content read of `file` removed. */
  const withoutOneRead = <
    Call extends { readonly method: string; readonly outcome: string; readonly path: string },
  >(
    calls: ReadonlyArray<Call>,
    file: string,
    nth = 0,
  ) => {
    const index = calls
      .flatMap((call, position) =>
        call.method === "readFile" && call.outcome === "success" && call.path === file
          ? [position]
          : [],
      )
      .at(nth);
    expect(index).toBeDefined();
    return index === undefined ? calls : [...calls.slice(0, index), ...calls.slice(index + 1)];
  };

  /** Every object reachable from `value`, itself included. */
  const objectsWithin = (value: unknown): ReadonlyArray<object> =>
    typeof value !== "object" || value === null
      ? []
      : [value, ...Object.values(value).flatMap(objectsWithin)];

  /** Run one preflight, counting only the work that call performs. */
  const measured = <A, E, R>(packageRoot: string, preflight: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const result = yield* work.provide(withLiveWorkspaceObservations(preflight));
      const calls = recording
        .calls()
        .filter((call) => call.path === packageRoot || call.path.startsWith(`${packageRoot}/`));
      return {
        result,
        calls,
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
        readFile: (relative: string) =>
          calls.filter(
            (call) =>
              call.method === "readFile" &&
              call.outcome === "success" &&
              call.path === nodePath.join(packageRoot, relative),
          ).length,
      };
    });

  for (const type of ["rule", "knowledge", "hook", "subagent"] as const)
    it.effect(`skips only the work a supplied ${type} hash and manifest stand for`, () => {
      const { workspace, packageRoot } = stage(type);
      const manifestFile = manifestFilenameForType(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const { manifest } = yield* readExtensionManifest(packageRoot, type);
        const facts = preparedManifestFacts({ manifest });
        const first = yield* computeSourceHash("first supplied hash");
        const second = yield* computeSourceHash("second supplied hash");
        const run = (supplied: {
          readonly sourceHash?: typeof first;
          readonly manifest?: typeof facts;
          readonly decodedManifest?: typeof manifest;
        }) =>
          measured(
            packageRoot,
            preflightAuthoredNativeProjection({
              identity,
              packageRoot,
              enabled: true,
              ...(supplied.sourceHash === undefined
                ? {}
                : { sourceHash: Effect.succeed(supplied.sourceHash) }),
              ...(supplied.manifest === undefined
                ? {}
                : { manifest: Effect.succeed(supplied.manifest) }),
              ...(supplied.decodedManifest === undefined
                ? {}
                : { decodedManifest: Effect.succeed(supplied.decodedManifest) }),
            }),
          );

        // The read decode starts mutable, so only the run can freeze it.
        expect(Object.isFrozen(manifest)).toBe(false);
        const runs = {
          neither: yield* run({}),
          hash: yield* run({ sourceHash: first }),
          facts: yield* run({ manifest: facts }),
          factsAndHash: yield* run({ sourceHash: first, manifest: facts }),
          decoded: yield* run({ decodedManifest: manifest }),
          decodedAndHash: yield* run({ sourceHash: first, decodedManifest: manifest }),
        };
        const otherHashFacts = yield* run({ sourceHash: second, manifest: facts });
        const otherHashDecoded = yield* run({ sourceHash: second, decodedManifest: manifest });

        const observed = (select: (run: (typeof runs)["neither"]) => number) =>
          Object.fromEntries(inputs.map((input) => [input, select(runs[input])]));
        expect({
          manifestReads: observed((run) => run.readFile(manifestFile)),
          payloadReads: observed((run) => run.readFile(payload[type])),
          hashes: observed((run) => run.hashes),
        }).toEqual({ manifestReads: manifestReads[type], payloadReads, hashes });

        // A different supplied hash changes neither the outcome nor any read.
        expect(otherHashFacts.result).toEqual(runs.factsAndHash.result);
        expect(otherHashFacts.calls).toEqual(runs.factsAndHash.calls);
        expect(otherHashDecoded.result).toEqual(runs.decodedAndHash.result);
        expect(otherHashDecoded.calls).toEqual(runs.decodedAndHash.calls);
        for (const input of inputs) expect(runs[input].result).toEqual(runs.neither.result);

        // A supplied decode stands only for the manager's own manifest read:
        // every other call, containment and type checks included, still runs
        // in the same order. The manager's read follows the package hash's
        // read unless the hash is supplied. The Subagent manager loads its
        // package itself.
        const lessManagerRead = (calls: (typeof runs)["facts"]["calls"], hashed: boolean) =>
          type === "subagent"
            ? calls
            : withoutOneRead(calls, nodePath.join(packageRoot, manifestFile), hashed ? 1 : 0);
        expect(runs.decoded.calls).toEqual(lessManagerRead(runs.facts.calls, true));
        expect(runs.decodedAndHash.calls).toEqual(lessManagerRead(runs.factsAndHash.calls, false));

        // The decode the run hands its manager is frozen all the way down.
        if (type !== "subagent") {
          const objects = objectsWithin(manifest);
          if (type !== "rule") expect(objects.length).toBeGreaterThan(1);
          expect(objects.filter((value) => !Object.isFrozen(value))).toEqual([]);
        }

        const renamedIdentity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/renamed`));
        const renamedDetail =
          type === "subagent"
            ? "Prepared subagent identity does not match the requested identity"
            : "Prepared authored package identity does not match the requested identity";
        const renamedFacts = yield* preflightAuthoredNativeProjection({
          identity,
          packageRoot,
          enabled: true,
          manifest: Effect.succeed({ ...facts, name: renamedIdentity.name }),
        }).pipe(withLiveWorkspaceObservations, Effect.flip);
        expect(renamedFacts).toMatchObject({ detail: renamedDetail });
        const renamedDecoded = yield* preflightAuthoredNativeProjection({
          identity,
          packageRoot,
          enabled: true,
          decodedManifest: Effect.succeed({ ...manifest, name: renamedIdentity.name }),
        }).pipe(withLiveWorkspaceObservations, Effect.flip);
        expect(renamedDecoded).toMatchObject({ detail: renamedDetail });
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  for (const type of ["hook", "subagent"] as const)
    it.effect(`reads nothing for a disabled ${type}`, () => {
      const { workspace, packageRoot } = stage(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const disabled = yield* measured(
          packageRoot,
          preflightAuthoredNativeProjection({ identity, packageRoot, enabled: false }),
        );
        expect(disabled.result).toEqual({});
        expect(disabled.calls).toEqual([]);
        expect(disabled.hashes).toBe(0);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  for (const type of ["rule", "knowledge", "hook"] as const)
    it.effect(`reads a ${type} manifest decoded for another package or type itself`, () => {
      const { workspace, packageRoot } = stage(type);
      const other = stage(type).packageRoot;
      const manifestFile = manifestFilenameForType(type);
      return Effect.gen(function* () {
        const location = yield* WorkspaceLocation;
        const { manifest } = yield* readExtensionManifest(packageRoot, type);
        const { manifest: foreign } = yield* readExtensionManifest(
          writeMinimalPackage(nodePath.join(nodePath.dirname(other), "foreign"), "subagent", {
            name: "review",
            owner: "@acme",
          }),
          "subagent",
        );
        const details = {
          refType: "workspace" as const,
          scope: location.scope,
          owner: manifest.owner,
          name: manifest.name,
          version: manifest.version,
          location: packageRoot,
          sourceHash: yield* computeSourceHash("supplied"),
        };
        const source = { type: "workspace" as const, owner: manifest.owner, name: manifest.name };
        const prepare = (preparedManifests: ReadonlyMap<string, PreparedManifestEntry>) => {
          const options = { nativeInsertionEligibleNames: new Set<string>(), preparedManifests };
          return Effect.gen(function* () {
            switch (type) {
              case "rule":
                return yield* (yield* RuleManager).prepareProjection(
                  [
                    {
                      ...details,
                      type,
                      source: { ...source, extensionType: type },
                      rule: { name: manifest.name },
                    },
                  ],
                  options,
                );
              case "hook":
                return yield* (yield* HookManager).prepareProjection(
                  [
                    {
                      ...details,
                      type,
                      source: { ...source, extensionType: type },
                      hook: { name: manifest.name },
                    },
                  ],
                  options,
                );
              case "knowledge":
                return yield* (yield* KnowledgeManager).prepareProjection(
                  [
                    {
                      ...details,
                      type,
                      source: { ...source, extensionType: type },
                      knowledge: { name: manifest.name },
                    },
                  ],
                  options,
                );
            }
          }).pipe(withWorkspaceReadView);
        };
        const prepared = (entry?: PreparedManifestEntry) =>
          measured(
            packageRoot,
            prepare(new Map(entry === undefined ? [] : [[manifest.name, entry]])),
          );
        const runs = {
          none: yield* prepared(),
          otherRoot: yield* prepared({ packageRoot: other, manifest }),
          otherType: yield* prepared({ packageRoot, manifest: foreign }),
          matching: yield* prepared({ packageRoot, manifest }),
        };
        // The HookManager's tree walk reads the manifest besides any decode.
        const walk = type === "hook" ? 1 : 0;
        expect({
          none: runs.none.readFile(manifestFile),
          otherRoot: runs.otherRoot.readFile(manifestFile),
          otherType: runs.otherType.readFile(manifestFile),
          matching: runs.matching.readFile(manifestFile),
        }).toEqual({ none: 1 + walk, otherRoot: 1 + walk, otherType: 1 + walk, matching: walk });
        // What a prepared projection would write: each plan's unit, target and
        // exclusions with its observation, and a Hook's agent outcomes and
        // tree acquisitions.
        const projectionOf = (result: (typeof runs)["none"]["result"]) => {
          const { plans, ...rest } = "plans" in result ? result : { plans: result };
          return observeProjectionPlans(plans).pipe(
            withWorkspaceReadView,
            Effect.map((observations) => ({
              ...rest,
              plans: plans.map(({ unitId, targetFile, exclusions }, index) => ({
                unitId,
                targetFile,
                exclusions,
                observation: observations[index],
              })),
            })),
          );
        };
        const projection = yield* projectionOf(runs.none.result);
        expect(projection.plans.length).toBeGreaterThan(0);
        // A matching decode skips only the manager's manifest read and yields
        // the same projection; an entry that does not match changes nothing.
        expect(yield* projectionOf(runs.matching.result)).toEqual(projection);
        expect(runs.matching.calls).toEqual(
          withoutOneRead(runs.none.calls, nodePath.join(packageRoot, manifestFile)),
        );
        for (const ignored of [runs.otherRoot, runs.otherType]) {
          expect(yield* projectionOf(ignored.result)).toEqual(projection);
          expect(ignored.calls).toEqual(runs.none.calls);
        }
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  it.effect("frames a hook's own content hash unless one was hashed for its root", () => {
    const { workspace, packageRoot } = stage("hook");
    const other = stage("hook").packageRoot;
    return Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const { manifest } = yield* readExtensionManifest(packageRoot, "hook");
      const supplied = yield* computeSourceHash("supplied");
      const prepare = (packageRootOfHash: string) =>
        Effect.gen(function* () {
          return yield* (yield* HookManager).prepareProjection(
            [
              {
                refType: "workspace",
                scope: location.scope,
                owner: manifest.owner,
                name: manifest.name,
                version: manifest.version,
                location: packageRoot,
                sourceHash: supplied,
                type: "hook",
                source: {
                  type: "workspace",
                  owner: manifest.owner,
                  name: manifest.name,
                  extensionType: "hook",
                },
                hook: { name: manifest.name },
              },
            ],
            {
              nativeInsertionEligibleNames: new Set<string>(),
              preparedContentHashes: new Map([
                [manifest.name, { packageRoot: packageRootOfHash, contentHash: supplied }],
              ]),
            },
          );
        }).pipe(withWorkspaceReadView);
      const otherRoot = yield* measured(packageRoot, prepare(other));
      const matching = yield* measured(packageRoot, prepare(packageRoot));
      expect({ otherRoot: otherRoot.hashes, matching: matching.hashes }).toEqual({
        otherRoot: 1,
        matching: 0,
      });
      // The tree walk still reads every staged file either way.
      expect(matching.calls).toEqual(otherRoot.calls);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
  });

  // Root reads a file whatever its mode, so this case cannot make one unreadable there.
  it.effect.skipIf(process.getuid?.() === 0)(
    "refuses an unreadable staged hook file at the tree walk when the hash is supplied",
    () => {
      const { workspace, packageRoot } = stage("hook");
      const unreadable = nodePath.join(packageRoot, "src/hook.sh");
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn("@acme/hooks/review"));
        const facts = preparedManifestFacts(yield* readExtensionManifest(packageRoot, "hook"));
        fs.chmodSync(unreadable, 0o000);
        cleanups.unshift(() => fs.chmodSync(unreadable, 0o644));
        const refused = yield* preflightAuthoredNativeProjection({
          identity,
          packageRoot,
          enabled: true,
          manifest: Effect.succeed(facts),
          sourceHash: Effect.succeed(yield* computeSourceHash("supplied")),
        }).pipe(withLiveWorkspaceObservations, Effect.flip);
        expect(refused).toMatchObject({
          _tag: "MaterializedTreeInvalid",
          root: packageRoot,
          reason: "cannot read src/hook.sh",
        });
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    },
  );
});

describe("authored native preflight documents", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const plural = { rule: "rules", knowledge: "knowledge", hook: "hooks", subagent: "subagents" };
  const mutations: ReadonlySet<string> = new Set([
    "writeFile",
    "file.write",
    "file.writeAll",
    "rename",
    "remove",
    "makeDirectory",
    "symlink",
    "link",
    "copy",
    "copyFile",
    "truncate",
  ]);

  /** A workspace configured for Claude Code with both documents present, and one staged package. */
  const stage = (type: keyof typeof plural) => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(workspace.cleanup);
    workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
    fs.writeFileSync(nodePath.join(workspace.root, "axm.lock"), "version = 1\n");
    const stagingRoot = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-preflight-documents-")),
    );
    cleanups.push(() => fs.rmSync(stagingRoot, { recursive: true, force: true }));
    const packageRoot = writeMinimalPackage(nodePath.join(stagingRoot, "review"), type, {
      name: "review",
      owner: "@acme",
    });
    return { workspace, packageRoot };
  };

  /** Run one preflight, counting the workspace-document work that call performs. */
  const documentWork = <A, E, R>(
    root: string,
    preflight: Effect.Effect<A, E, R>,
    boundary: (effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const spans: Array<Tracer.NativeSpan> = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const result = yield* work.provide(boundary(preflight)).pipe(Effect.withTracer(tracer));
      const facts = (kind: string) => work.facts.filter((fact) => fact.kind === kind).length;
      return {
        result,
        settingsReads: recording.contentReads(nodePath.join(root, "axm.json")),
        lockfileReads: recording.contentReads(nodePath.join(root, "axm.lock")),
        settingsParses: facts("axm.parse.settings"),
        lockfileParses: facts("axm.parse.lockfile"),
        invalidations: facts("axm.observation.invalidate"),
        mutations: recording.calls().filter((call) => mutations.has(call.method)),
        phases: spans.filter((span) => span.name === "axm.observation.phase").length,
      };
    });

  // Each enabled preflight decodes the workspace documents in one read phase,
  // even after an earlier phase was retired, as at prepare time.
  for (const type of ["rule", "knowledge", "hook", "subagent"] as const)
    it.effect(`decodes the workspace documents once for an enabled ${type}`, () => {
      const { workspace, packageRoot } = stage(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const run = yield* documentWork(
          workspace.root,
          preflightAuthoredNativeProjection({ identity, packageRoot, enabled: true }),
          withLiveWorkspaceObservations,
        );
        expect({
          settingsReads: run.settingsReads,
          lockfileReads: run.lockfileReads,
          settingsParses: run.settingsParses,
          lockfileParses: run.lockfileParses,
          invalidations: run.invalidations,
          mutations: run.mutations,
        }).toEqual({
          settingsReads: 1,
          lockfileReads: 1,
          settingsParses: 1,
          lockfileParses: 1,
          invalidations: 0,
          mutations: [],
        });
        expect(run.phases).toBe(1);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  for (const type of ["hook", "subagent"] as const)
    it.effect(`opens no read phase for a disabled ${type}`, () => {
      const { workspace, packageRoot } = stage(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const run = yield* documentWork(
          workspace.root,
          preflightAuthoredNativeProjection({ identity, packageRoot, enabled: false }),
          withLiveWorkspaceObservations,
        );
        expect(run.result).toEqual({});
        expect(run.settingsReads + run.lockfileReads).toBe(0);
        expect(run.settingsParses + run.lockfileParses).toBe(0);
        expect(run.phases).toBe(0);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  for (const type of ["rule", "knowledge", "subagent"] as const)
    it.effect(`reuses an enclosing read phase for a ${type}`, () => {
      const { workspace, packageRoot } = stage(type);
      return Effect.gen(function* () {
        const identity = yield* Effect.fromResult(parseFqn(`@acme/${plural[type]}/review`));
        const run = yield* documentWork(
          workspace.root,
          preflightAuthoredNativeProjection({ identity, packageRoot, enabled: true }),
          withWorkspaceReadView,
        );
        expect({
          settingsReads: run.settingsReads,
          lockfileReads: run.lockfileReads,
          settingsParses: run.settingsParses,
          lockfileParses: run.lockfileParses,
        }).toEqual({ settingsReads: 1, lockfileReads: 1, settingsParses: 1, lockfileParses: 1 });
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
    });

  it.effect("sees configured agents edited between two preflight runs", () => {
    const { workspace, packageRoot } = stage("subagent");
    return Effect.gen(function* () {
      const identity = yield* Effect.fromResult(parseFqn("@acme/subagents/review"));
      const preflight = preflightAuthoredNativeProjection({
        identity,
        packageRoot,
        enabled: true,
      }).pipe(withLiveWorkspaceObservations);
      const before = yield* preflight;
      workspace.writeSettings({ owner: "@acme", agents: ["codex"], instructionFiles: {} });
      const after = yield* preflight;
      expect((before.agentOutcomes ?? []).map((outcome) => outcome.agentId)).toEqual([
        "claude-code",
      ]);
      expect((after.agentOutcomes ?? []).map((outcome) => outcome.agentId)).toEqual(["codex"]);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(workspace)));
  });
});
