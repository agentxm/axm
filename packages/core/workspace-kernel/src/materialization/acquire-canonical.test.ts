import { NativePlatformTest } from "../locations/testing.js";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import type { LocalHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { RegistrySubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  AcquiredContent,
  canonicalMaterializationPaths,
  materializeRegistryPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  retireCanonicalDirectory,
  reusableCanonicalTree,
  sourceRefContentKey,
} from "../acquisition/index.js";
import { computeMaterializedTreeIntegrity, type LockEntry } from "../workspace-state/index.js";
import { NativeWriteAuthorityLive } from "../projection/live.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { exactVersion, extensionName, handle } from "../workspace-state/testing.js";
import { acquireCanonicalForRef } from "./acquire-canonical.js";

describe("canonical acquisition dispatch", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-acquire-canonical-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const refFor = (packageRoot: string): LocalHookRef => ({
    type: "hook",
    refType: "local",
    owner: handle("@acme"),
    name: extensionName("audit"),
    hook: { name: extensionName("audit") },
    source: { type: "local", path: packageRoot },
    location: pathToFileURL(packageRoot).href,
  });

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    const authority = NativeWriteAuthorityLive.pipe(
      Layer.provideMerge(
        Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
      ),
    );
    const services = Layer.merge(authority, RegistryTransportTest(FetchHttpClient.layer)).pipe(
      Layer.provideMerge(NativePlatformTest),
    );
    return effect.pipe(Effect.provide(services));
  };

  it.effect("keeps an accepted local tree until acquisition is forced", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "hook.sh"), "old");
        const ref = refFor(source);
        const args = {
          ref,
          type: "hook",
          baseDir: root,
          canonicalPath,
          copyFailure: { code: "validation", detail: (target: string) => `copy failed: ${target}` },
        } as const;
        const initial = yield* acquireCanonicalForRef({
          ...args,
          accepted: Option.none(),
          force: false,
          external: { reuse: true },
        });
        const accepted = Option.some<LockEntry>({
          source: { type: "path", path: "source" },
          identity: { owner: handle("@acme"), name: extensionName("audit") },
          resolved: { tree: initial.treeIntegrity },
          treeIntegrity: initial.treeIntegrity,
        });
        fs.writeFileSync(path.join(source, "hook.sh"), "new");
        const reused = yield* acquireCanonicalForRef({
          ...args,
          accepted,
          force: false,
          external: { reuse: true },
        });
        expect(reused.reused).toBe(true);
        expect(fs.readFileSync(path.join(canonicalPath, "hook.sh"), "utf8")).toBe("old");
        const forced = yield* acquireCanonicalForRef({
          ...args,
          accepted,
          force: true,
          external: { reuse: true },
        });
        expect(forced.reused).toBe(false);
        expect(fs.readFileSync(path.join(canonicalPath, "hook.sh"), "utf8")).toBe("new");
        expect(forced.treeIntegrity).not.toBe(initial.treeIntegrity);
      }),
    ),
  );

  it.effect("maps external source and target paths without copying the package root", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        const targetPath = path.join(canonicalPath, "src");
        fs.mkdirSync(path.join(source, "src"), { recursive: true });
        fs.writeFileSync(path.join(source, "manifest.json"), "{}");
        fs.writeFileSync(path.join(source, "src", "hook.sh"), "contents");
        const acquired = yield* acquireCanonicalForRef({
          ref: refFor(source),
          type: "hook",
          baseDir: root,
          canonicalPath,
          accepted: Option.none(),
          force: false,
          nativeInsertionEligible: true,
          copyFailure: { code: "validation", detail: (target) => `copy failed: ${target}` },
          external: {
            sourcePath: (packageRoot) => path.join(packageRoot, "src"),
            targetPath,
          },
        });
        expect(acquired.packageRoot).toBe(targetPath);
        expect(fs.readFileSync(path.join(targetPath, "hook.sh"), "utf8")).toBe("contents");
        expect(fs.existsSync(path.join(targetPath, "manifest.json"))).toBe(false);
        yield* retireCanonicalDirectory(targetPath);
        expect(fs.existsSync(path.join(root, "canonical"))).toBe(false);
        expect(fs.readFileSync(path.join(source, "src", "hook.sh"), "utf8")).toBe("contents");
      }),
    ),
  );

  it.effect("reacquires accepted bytes when the owner selects a different declaration", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "hook.sh"), "old declaration");
        const args = {
          ref: refFor(source),
          type: "hook",
          baseDir: root,
          canonicalPath,
          force: false,
          external: { reuse: true },
          copyFailure: { code: "validation", detail: () => "copy failed" },
        } as const;
        const initial = yield* acquireCanonicalForRef({ ...args, accepted: Option.none() });
        const accepted = Option.some<LockEntry>({
          source: { type: "path", path: "source" },
          identity: { owner: handle("@acme"), name: extensionName("audit") },
          resolved: { tree: initial.treeIntegrity },
          treeIntegrity: initial.treeIntegrity,
        });
        fs.writeFileSync(path.join(source, "hook.sh"), "selected declaration");
        const acquired = yield* acquireCanonicalForRef({
          ...args,
          accepted,
          external: { reuse: false },
          validate: (directory) =>
            fs.readFileSync(path.join(directory, "hook.sh"), "utf8") === "selected declaration"
              ? Effect.void
              : Effect.fail("declaration mismatch"),
        });
        expect(acquired.reused).toBe(false);
        expect(fs.readFileSync(path.join(canonicalPath, "hook.sh"), "utf8")).toBe(
          "selected declaration",
        );
        expect(acquired.treeIntegrity).not.toBe(initial.treeIntegrity);
      }),
    ),
  );

  it.effect("preserves a reused tree and the owner's validation failure without reacquiring", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "hook.sh"), "accepted content");
        const args = {
          ref: refFor(source),
          type: "hook",
          baseDir: root,
          canonicalPath,
          force: false,
          external: { reuse: true },
          copyFailure: { code: "validation", detail: () => "copy failed" },
        } as const;
        const initial = yield* acquireCanonicalForRef({ ...args, accepted: Option.none() });
        const accepted = Option.some<LockEntry>({
          source: { type: "path", path: "source" },
          identity: { owner: handle("@acme"), name: extensionName("audit") },
          resolved: { tree: initial.treeIntegrity },
          treeIntegrity: initial.treeIntegrity,
        });
        fs.writeFileSync(path.join(source, "hook.sh"), "replacement would pass validation");
        const refusal = { _tag: "OwnerValidationRefused", detail: "Unsupported package" } as const;
        const failure = yield* Effect.flip(
          acquireCanonicalForRef({
            ...args,
            accepted,
            validate: (directory) =>
              fs.readFileSync(path.join(directory, "hook.sh"), "utf8") === "accepted content"
                ? Effect.fail(refusal)
                : Effect.void,
          }),
        );
        expect(failure).toBe(refusal);
        expect(fs.readFileSync(path.join(canonicalPath, "hook.sh"), "utf8")).toBe(
          "accepted content",
        );
        expect(yield* computeMaterializedTreeIntegrity(canonicalPath)).toBe(initial.treeIntegrity);
      }),
    ),
  );

  it.effect("records registry publication parents independently of an external source target", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "registry", "@acme", "subagents", "review");
        fs.mkdirSync(path.join(source, "src"), { recursive: true });
        fs.writeFileSync(path.join(source, "subagent.json"), "{}");
        fs.writeFileSync(path.join(source, "src", "review.md"), "Review the change.");
        const ref: RegistrySubagentRef = {
          type: "subagent",
          refType: "registry",
          subagent: { name: extensionName("review"), description: Option.none() },
          source: {
            type: "registry",
            name: "test",
            location: decodeRegistryEndpointSync("https://registry.example"),
            owner: Option.some(handle("@acme")),
          },
          owner: handle("@acme"),
          publisherBindingId: "binding-1",
          name: extensionName("review"),
          version: exactVersion("1.0.0"),
          integrity: Option.none(),
          packages: [],
        };
        const key = sourceRefContentKey(ref);
        const acquired = yield* acquireCanonicalForRef({
          ref,
          type: "subagent",
          baseDir: root,
          canonicalPath,
          accepted: Option.none(),
          force: false,
          nativeInsertionEligible: true,
          copyFailure: { code: "internal", detail: (target) => `copy failed: ${target}` },
          // A manager can supply both acquisition recipes; Registry always
          // publishes the whole package, unlike this external-source recipe.
          external: {
            sourcePath: (packageRoot) => path.join(packageRoot, "src"),
            targetPath: path.join(canonicalPath, "src"),
          },
        }).pipe(
          Effect.provideService(AcquiredContent, {
            requestedKeys: new Set([key]),
            filesByKey: new Map([[key, { directory: source }]]),
            failuresByKey: new Map(),
          }),
        );
        expect(acquired.packageRoot).toBe(canonicalPath);
        expect(fs.readFileSync(path.join(canonicalPath, "subagent.json"), "utf8")).toBe("{}");
        expect(fs.readFileSync(path.join(canonicalPath, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
        yield* retireCanonicalDirectory(canonicalPath);
        expect(fs.existsSync(path.join(root, "registry"))).toBe(false);
        expect(fs.readFileSync(path.join(source, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
      }),
    ),
  );

  it.effect("stages acquired bytes away from the canonical destination", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        const stagedPath = path.join(root, "staging", "audit");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "hook.sh"), "staged");
        const acquired = yield* acquireCanonicalForRef({
          ref: refFor(source),
          type: "hook",
          baseDir: root,
          canonicalPath,
          accepted: Option.none(),
          force: false,
          copyFailure: { code: "validation", detail: (target) => `copy failed: ${target}` },
          stage: { baseDir: root, destinationPath: stagedPath },
        });
        expect(acquired.packageRoot).toBe(stagedPath);
        expect(fs.existsSync(canonicalPath)).toBe(false);
        expect(fs.readFileSync(path.join(stagedPath, "hook.sh"), "utf8")).toBe("staged");
        expect(acquired.treeIntegrity).toBe(yield* computeMaterializedTreeIntegrity(stagedPath));
      }),
    ),
  );
});

describe("canonical acquisition recovery", () => {
  let root: string;
  let workspaceRoot: string;
  let canonicalPath: string;
  let source: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-acquire-canonical-recovery-"));
    workspaceRoot = path.join(root, "workspace");
    canonicalPath = path.join(workspaceRoot, ".axm", "extensions", "@acme", "subagents", "review");
    source = path.join(root, "source");
    fs.mkdirSync(workspaceRoot);
    fs.mkdirSync(path.join(source, "src"), { recursive: true });
    fs.writeFileSync(path.join(source, "subagent.json"), "{}");
    fs.writeFileSync(path.join(source, "src", "review.md"), "Review the change.");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const ref: RegistrySubagentRef = {
    type: "subagent",
    refType: "registry",
    subagent: { name: extensionName("review"), description: Option.none() },
    source: {
      type: "registry",
      name: "test",
      location: decodeRegistryEndpointSync("https://registry.example"),
      owner: Option.some(handle("@acme")),
    },
    owner: handle("@acme"),
    publisherBindingId: "binding-1",
    name: extensionName("review"),
    version: exactVersion("1.0.0"),
    integrity: Option.none(),
    packages: [],
  };
  const requested = {
    refType: "registry",
    owner: "@acme",
    name: "review",
    version: "1.0.0",
    publisherBindingId: "binding-1",
  } as const;

  /** The transition acquired the package before the lock: no Registry fetch runs. */
  const prepared = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, AcquiredContent, {
      requestedKeys: new Set([sourceRefContentKey(ref)]),
      filesByKey: new Map([[sourceRefContentKey(ref), { directory: source }]]),
      failuresByKey: new Map(),
    });

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    const authority = NativeWriteAuthorityLive.pipe(
      Layer.provideMerge(
        Layer.merge(WorkspaceReadTest({ baseDir: workspaceRoot }), WorkspaceFileWriteLocksLive),
      ),
    );
    const services = Layer.merge(authority, RegistryTransportTest(FetchHttpClient.layer)).pipe(
      Layer.provideMerge(NativePlatformTest),
    );
    return effect.pipe(Effect.provide(services));
  };

  /** Record one call chain; fixture setup stays outside the recording. */
  const recorded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      recording.reset();
      const result = yield* effect.pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
      return { result, recording };
    });

  /** Each recovery probes the backup once and discards staging once. */
  const recoveries = (recording: FileSystemRecording, target: string) => {
    const { stagingPath, backupPath } = canonicalMaterializationPaths(target);
    const backupProbes = recording.calls({ path: backupPath, method: "access" }).length;
    const stagingCleanups = recording.calls({ path: stagingPath, method: "remove" }).length;
    expect(stagingCleanups).toBe(backupProbes);
    return backupProbes;
  };

  const acquire = (args: {
    readonly accepted: Option.Option<LockEntry>;
    readonly canonicalPath?: string;
    readonly stage?: { readonly baseDir: string; readonly destinationPath: string };
  }) =>
    acquireCanonicalForRef({
      ref,
      type: "subagent",
      baseDir: workspaceRoot,
      canonicalPath: args.canonicalPath ?? canonicalPath,
      accepted: args.accepted,
      force: false,
      copyFailure: { code: "internal", detail: (target) => `copy failed: ${target}` },
      ...(args.stage === undefined ? {} : { stage: args.stage }),
    }).pipe(prepared);

  const acceptedTree = (treeIntegrity: LockEntry["treeIntegrity"]) =>
    Option.some<LockEntry>({
      source: {
        type: "registry",
        url: decodeRegistryEndpointSync("https://registry.example"),
      },
      identity: { owner: handle("@acme"), name: extensionName("review") },
      resolved: {
        version: exactVersion("1.0.0"),
        integrity: "sha512-archive",
        publisherBindingId: "binding-1",
      },
      treeIntegrity,
    });

  it.effect("recovers a Registry canonical path once before reuse and once at replacement", () =>
    run(
      Effect.gen(function* () {
        const { result, recording } = yield* recorded(acquire({ accepted: Option.none() }));

        expect(result.reused).toBe(false);
        expect(recoveries(recording, canonicalPath)).toBe(2);
        expect(fs.readFileSync(path.join(canonicalPath, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
      }),
    ),
  );

  it.effect("recovers a reused Registry canonical path once", () =>
    run(
      Effect.gen(function* () {
        fs.cpSync(source, canonicalPath, { recursive: true });
        const accepted = acceptedTree(yield* computeMaterializedTreeIntegrity(canonicalPath));

        const { result, recording } = yield* recorded(acquire({ accepted }));

        expect(result.reused).toBe(true);
        expect(recoveries(recording, canonicalPath)).toBe(1);
      }),
    ),
  );

  it.effect("recovers only the stage destination of a staged Registry acquisition", () =>
    run(
      Effect.gen(function* () {
        const destinationPath = path.join(root, "staged", "review");

        const { result, recording } = yield* recorded(
          acquire({
            accepted: Option.none(),
            stage: { baseDir: root, destinationPath },
          }),
        );

        expect(result.packageRoot).toBe(destinationPath);
        expect(recoveries(recording, destinationPath)).toBe(1);
        expect(recoveries(recording, canonicalPath)).toBe(0);
      }),
    ),
  );

  const materialize = (recovered?: Parameters<typeof recoverCanonicalDirectory>[0]["recovered"]) =>
    materializeRegistryPackageWithTreeIntegrity({
      baseDir: workspaceRoot,
      destinationPath: canonicalPath,
      sourceLocation: ref.source.location,
      owner: ref.owner,
      type: "subagent",
      name: ref.name,
      version: ref.version,
      integrity: ref.integrity,
      publisherBindingId: ref.publisherBindingId,
      messages: { integrityMismatchDetail: "Fixture integrity" },
      ...(recovered === undefined ? {} : { recovered }),
    }).pipe(prepared);

  it.effect("recovers twice when Registry materialization has no earlier recovery", () =>
    run(
      Effect.gen(function* () {
        const { recording } = yield* recorded(materialize());

        expect(recoveries(recording, canonicalPath)).toBe(2);
      }),
    ),
  );

  it.effect("discards foreign staging created after the reuse recovery", () =>
    run(
      Effect.gen(function* () {
        const { recovery } = yield* reusableCanonicalTree({
          canonicalPath,
          requested,
          accepted: Option.none(),
          force: false,
        });
        const { stagingPath } = canonicalMaterializationPaths(canonicalPath);
        fs.mkdirSync(stagingPath, { recursive: true });
        fs.writeFileSync(path.join(stagingPath, "foreign.md"), "foreign");

        yield* materialize(recovery);

        expect(fs.existsSync(path.join(canonicalPath, "foreign.md"))).toBe(false);
        expect(fs.existsSync(stagingPath)).toBe(false);
        expect(fs.readFileSync(path.join(canonicalPath, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
      }),
    ),
  );

  it.effect("restores a backup left by a failed swap at the replacement recovery", () =>
    run(
      Effect.gen(function* () {
        fs.mkdirSync(canonicalPath, { recursive: true });
        fs.writeFileSync(path.join(canonicalPath, "prior.md"), "prior");
        const { recovery } = yield* reusableCanonicalTree({
          canonicalPath,
          requested,
          accepted: Option.none(),
          force: false,
        });
        // A swap whose restore also failed leaves only the backup.
        const { backupPath } = canonicalMaterializationPaths(canonicalPath);
        fs.renameSync(canonicalPath, backupPath);

        const { recording } = yield* recorded(materialize(recovery));

        expect(
          recording
            .calls({ path: backupPath, method: "rename" })
            .filter((call) => call.toPath === canonicalPath),
        ).toHaveLength(1);
        expect(fs.existsSync(backupPath)).toBe(false);
        expect(fs.existsSync(path.join(canonicalPath, "prior.md"))).toBe(false);
        expect(fs.readFileSync(path.join(canonicalPath, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
      }),
    ),
  );

  it.effect("recovers unless the witness is unused and names the same path", () =>
    run(
      Effect.gen(function* () {
        const otherPath = path.join(workspaceRoot, ".axm", "extensions", "@acme", "other");
        const { recovery: forOther } = yield* reusableCanonicalTree({
          canonicalPath: otherPath,
          requested,
          accepted: Option.none(),
          force: false,
        });
        const { recovery } = yield* reusableCanonicalTree({
          canonicalPath,
          requested,
          accepted: Option.none(),
          force: false,
        });
        const recover = (recovered: typeof recovery) =>
          recorded(
            recoverCanonicalDirectory({ baseDir: workspaceRoot, canonicalPath, recovered }),
          ).pipe(Effect.map(({ recording }) => recoveries(recording, canonicalPath)));

        expect(yield* recover(forOther)).toBe(1);
        expect(yield* recover(recovery)).toBe(0);
        expect(yield* recover(recovery)).toBe(1);
      }),
    ),
  );

  it("accepts only a witness minted by a recovery", () => {
    const forged = () =>
      recoverCanonicalDirectory({
        baseDir: workspaceRoot,
        canonicalPath,
        // @ts-expect-error A structurally identical object proves no recovery.
        recovered: { consume: () => true },
      });
    expect(typeof forged).toBe("function");
  });

  it.effect("refuses an unsafe Registry canonical path after the reuse recovery", () =>
    run(
      Effect.gen(function* () {
        const unsafePath = path.join(root, "outside", "review");

        const { result: failure, recording } = yield* recorded(
          acquire({ accepted: Option.none(), canonicalPath: unsafePath }).pipe(Effect.flip),
        );

        expect(failure._tag).toBe("PathTraversalDetected");
        // The reuse decision recovers the path first; the pre-fetch lexical
        // checks then refuse it before any further recovery or publication.
        expect(recoveries(recording, unsafePath)).toBe(1);
        expect(fs.existsSync(unsafePath)).toBe(false);
      }),
    ),
  );
});
