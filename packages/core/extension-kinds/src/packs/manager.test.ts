/**
 * Installing a Pack observes its canonical directory only where the install
 * judges it: the workspace route probes the authored package once, after its
 * location check, and every acquired route leaves that directory to the
 * acquisition.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import {
  FileSystemRecorder,
  layerRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import { AcquiredContent, sourceRefContentKey } from "@agentxm/workspace-kernel/acquisition";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { RegistryClientFactory } from "@agentxm/registry-client";
import type {
  RegistryPackRef,
  WorkspacePackRef,
} from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import { PackManager } from "@agentxm/workspace-kernel/materialization";
import { FootprintRecorderTest } from "@agentxm/workspace-kernel/planning/testing";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import {
  computeMaterializedTreeIntegrity,
  computePackPathsForLayout,
  computeSourceHash,
  WorkspaceLocation,
  LOCKFILE_VERSION,
  type Lockfile,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  WorkspaceReadTest,
  exactVersion,
  extensionName,
  handle,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { PackDefinitionInvalid } from "./index.js";
import { PackManagerLive } from "./live.js";

const manifest = {
  owner: "@acme",
  type: "pack",
  name: "toolkit",
  version: "1.0.0",
  dependencies: { "@acme/skills/review": "^1.0.0" },
};

const registryRef: RegistryPackRef = {
  type: "pack",
  refType: "registry",
  owner: handle(manifest.owner),
  name: extensionName(manifest.name),
  source: {
    type: "registry",
    name: "test",
    location: decodeRegistryEndpointSync("https://registry.example"),
    owner: Option.none(),
  },
  version: exactVersion(manifest.version),
  publisherBindingId: "binding",
  integrity: Option.some("sha512-test"),
  packages: [],
  pack: { name: extensionName(manifest.name), dependencies: manifest.dependencies },
};

let baseDir: string;

beforeEach(() => {
  baseDir = nodeFs.realpathSync(nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-pack-")));
});

afterEach(() => {
  nodeFs.rmSync(baseDir, { recursive: true, force: true });
});

/** The canonical directory of the acquired Registry Pack, as the workspace layout places it. */
const registryPackDir = Effect.gen(function* () {
  const layout = yield* Ref.get((yield* WorkspaceLocation).layout);
  return computePackPathsForLayout(nodePath.join, layout, registryRef, registryRef.name)
    .canonicalPath;
});

const fetchedSource = (pack: Readonly<Record<string, unknown>> = manifest) => {
  const source = nodePath.join(baseDir, "fetched");
  nodeFs.mkdirSync(source, { recursive: true });
  nodeFs.writeFileSync(nodePath.join(source, "pack.json"), JSON.stringify(pack));
  nodeFs.writeFileSync(nodePath.join(source, "README.md"), "# Toolkit\n");
  return source;
};

/**
 * PackManagerLive over a recording filesystem that backs both the layer build
 * and every call, with the accepted lock read from `accepted`.
 */
const withPackManager = <A, E>(
  accepted: Effect.Effect<Lockfile, never> | "unreadable",
  use: Effect.Effect<A, E, PackManager | FileSystemRecorder | WorkspaceLocation>,
) => {
  const source = fetchedSource();
  const read = WorkspaceReadTest({
    baseDir,
    acceptedResolutions:
      accepted === "unreadable"
        ? Effect.die("the accepted lock is not readable in this case")
        : accepted,
  });
  const dependencies = Layer.mergeAll(
    read,
    Layer.succeed(AcquiredContent, {
      requestedKeys: new Set([sourceRefContentKey(registryRef)]),
      filesByKey: new Map([[sourceRefContentKey(registryRef), { directory: source }]]),
      failuresByKey: new Map(),
    }),
    Layer.mock(RegistryClientFactory, {}),
    Layer.mock(SourceHostProviders, {
      fetch: () => Effect.succeed({ directory: source }),
      cloneUrl: () => Option.none(),
      origin: () => "unused",
    }),
    NativeWriteAuthorityPermissive,
    FootprintRecorderTest,
  );
  return use.pipe(
    Effect.provide(PackManagerLive.pipe(Layer.provideMerge(dependencies))),
    Effect.provide(layerRecordingFileSystem(NodeFileSystem.layer)),
    Effect.provide(NativePlatformTest),
  );
};

/** Materialize the Registry Pack once and accept its resolution into `lock`. */
const acceptRegistryPack = (lock: Ref.Ref<Lockfile>) =>
  Effect.gen(function* () {
    const manager = yield* PackManager;
    const initial = yield* manager.materializeInstall({ ref: registryRef });
    const recorded = yield* manager.acceptedResolution({
      ref: registryRef,
      materialization: Option.some(initial),
    });
    if (Option.isNone(recorded)) return yield* Effect.die("Expected an accepted Pack resolution");
    yield* Ref.update(lock, (current) => ({
      ...current,
      packs: { [registryRef.name]: recorded.value.entry },
    }));
    return recorded.value.entry;
  });

const emptyLock = (): Lockfile => ({ lockfileVersion: LOCKFILE_VERSION, skills: {} });

const workspaceRef = (location: string): Effect.Effect<WorkspacePackRef> =>
  Effect.gen(function* () {
    return {
      type: "pack",
      refType: "workspace",
      source: {
        type: "workspace",
        owner: handle(manifest.owner),
        extensionType: "pack",
        name: extensionName(manifest.name),
      },
      owner: handle(manifest.owner),
      name: extensionName(manifest.name),
      version: exactVersion(manifest.version),
      scope: "project",
      location,
      sourceHash: yield* computeSourceHash(manifest.name),
      pack: { name: extensionName(manifest.name), dependencies: manifest.dependencies },
    };
  });

/** Existence probes of `path`: the recording filesystem derives `exists` from `access`. */
const probesOf = (recording: FileSystemRecording, path: string) =>
  recording.calls({ path, method: "access" }).length;

describe("Pack install canonical directory observation", () => {
  it.effect("does not probe the canonical directory for an acquired ref", () =>
    withPackManager(
      "unreadable",
      Effect.gen(function* () {
        const manager = yield* PackManager;
        const recording = yield* FileSystemRecorder;
        recording.reset();
        const exit = yield* manager.materializeInstall({ ref: registryRef }).pipe(Effect.exit);
        expect(exit._tag).toBe("Failure");
        expect(probesOf(recording, yield* registryPackDir)).toBe(0);
      }),
    ),
  );

  it.effect("refuses a misplaced workspace Pack without probing its canonical directory", () =>
    withPackManager(
      Effect.succeed(emptyLock()),
      Effect.gen(function* () {
        const manager = yield* PackManager;
        const recording = yield* FileSystemRecorder;
        const authored = nodePath.join(baseDir, "packs", manifest.name);
        const ref = yield* workspaceRef(nodePath.join(baseDir, "elsewhere"));
        recording.reset();
        const failure = yield* manager.materializeInstall({ ref }).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(PackDefinitionInvalid);
        expect(failure).toMatchObject({
          detail: `Invalid workspace pack source location: ${ref.location}`,
        });
        expect(probesOf(recording, authored)).toBe(0);
      }),
    ),
  );

  it.effect("probes an authored workspace Pack once, present or absent", () =>
    withPackManager(
      Effect.succeed(emptyLock()),
      Effect.gen(function* () {
        const manager = yield* PackManager;
        const recording = yield* FileSystemRecorder;
        const authored = nodePath.join(baseDir, "packs", manifest.name);
        const ref = yield* workspaceRef(authored);

        recording.reset();
        const missing = yield* manager.materializeInstall({ ref }).pipe(Effect.flip);
        expect(missing).toMatchObject({
          _tag: "PackDefinitionInvalid",
          detail: `Workspace pack package is missing: ${authored}`,
        });
        expect(probesOf(recording, authored)).toBe(1);

        nodeFs.mkdirSync(authored, { recursive: true });
        recording.reset();
        const present = yield* manager.materializeInstall({ ref });
        expect(Option.isNone(present.treeIntegrity)).toBe(true);
        expect(probesOf(recording, authored)).toBe(1);
      }),
    ),
  );

  it.effect("leaves reuse of an intact accepted Pack tree as the only probe of its directory", () =>
    Effect.gen(function* () {
      const lock = yield* Ref.make(emptyLock());
      yield* withPackManager(
        Ref.get(lock),
        Effect.gen(function* () {
          const manager = yield* PackManager;
          const recording = yield* FileSystemRecorder;
          const entry = yield* acceptRegistryPack(lock);
          recording.reset();
          const reused = yield* manager.materializeInstall({ ref: registryRef });
          expect(reused.treeIntegrity).toEqual(Option.some(entry.treeIntegrity));
          expect(recording.counts(yield* registryPackDir)).toEqual({ access: 1, readDirectory: 1 });
        }),
      );
    }),
  );
});
