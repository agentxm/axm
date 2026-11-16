import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type {
  LocalSkillRef,
  RegistrySkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { testRegistryEndpoint } from "@agentxm/registry-client/testing";
import { NativePlatformTest } from "../../locations/testing.js";
import {
  LOCKFILE_VERSION,
  packageAddressClaimForRef,
  type Lockfile,
} from "../../workspace-state/index.js";
import { WorkspaceReadTest, makeRegistrySkillLockEntry } from "../../workspace-state/testing.js";
import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import { preflightPackagePlacement } from "./package-placement.js";

const ref = (version: string): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  name: decodeExtensionNameSync("review"),
  owner: decodeHandleSync("@acme"),
  version: decodeVersionSync(version),
  skill: {
    name: decodeExtensionNameSync("review"),
    description: Option.none(),
    metadata: Option.none(),
  },
  integrity: Option.some(`sha512-${"A".repeat(86)}==`),
  publisherBindingId: "publisher-1",
  packages: [],
  source: { type: "registry", name: "test", location: testRegistryEndpoint, owner: Option.none() },
});

it.effect("rejects two acquired snapshots for one retained package", () =>
  Effect.gen(function* () {
    const workspace = yield* makeSpecWorkspace("axm-placement-");
    const context = makeSpecContext(workspace.workspaceDir);
    const error = yield* preflightPackagePlacement([ref("1.0.0"), ref("1.1.0")], []).pipe(
      Effect.flip,
      Effect.provide(context.layer),
    );
    expect(error).toMatchObject({
      category: "conflict",
      detail: expect.stringContaining("disagree on the snapshot"),
    });
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

it.effect("allows an accepted exposure alongside a newer acquisition at the same address", () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspace = yield* makeSpecWorkspace("axm-placement-");
    const context = makeSpecContext(workspace.workspaceDir);
    const paths = yield* preflightPackagePlacement([ref("1.1.0")], [ref("1.0.0")]).pipe(
      Effect.provide(context.layer),
    );
    expect(paths.some((target) => target.endsWith(path.join("@acme", "skills", "review")))).toBe(
      true,
    );
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

describe("one placement preflight over repeated claims", () => {
  const otherRef = (): RegistrySkillRef => ({ ...ref("1.0.0"), owner: decodeHandleSync("@other") });
  const acceptedReview = {
    lockfileVersion: LOCKFILE_VERSION,
    skills: {
      review: makeRegistrySkillLockEntry({
        owner: decodeHandleSync("@acme"),
        name: "review",
        endpoint: testRegistryEndpoint,
      }),
    },
  } satisfies Lockfile;

  /** Run one preflight through a recording port over a real temporary workspace. */
  const preflight = (
    acquisitionRefs: ReadonlyArray<RegistrySkillRef>,
    exposureRefs: ReadonlyArray<RegistrySkillRef>,
    options: {
      readonly lockfile?: Lockfile;
      readonly arrange?: (acquiredRoot: string) => void;
    } = {},
  ) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const workspace = yield* makeSpecWorkspace("axm-placement-");
      // Physical spelling, so the lexical and resolved destination paths coincide on every host.
      const root = nodeFs.realpathSync(workspace.root);
      const acquiredRoot = path.join(root, "agent_extensions");
      const address = (selected: RegistrySkillRef) => {
        const claim = packageAddressClaimForRef(selected);
        if (Result.isFailure(claim)) throw new Error(claim.failure.detail);
        return path.join(acquiredRoot, ...claim.success.address.split("/"));
      };
      options.arrange?.(acquiredRoot);
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const outcome = yield* preflightPackagePlacement(acquisitionRefs, exposureRefs).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(
          WorkspaceReadTest({
            baseDir: root,
            runtimeDir: path.join(root, ".axm"),
            ...(options.lockfile === undefined ? {} : { lockfile: options.lockfile }),
          }),
        ),
        Effect.result,
      );
      return { outcome, recording, acquiredRoot, destination: address(ref("1.0.0")), address };
    });

  it.effect("resolves an unaccepted destination and its scratch boundaries once per package", () =>
    Effect.gen(function* () {
      const { outcome, recording, destination } = yield* preflight([ref("1.1.0")], [ref("1.0.0")]);
      expect(outcome).toEqual(
        Result.succeed([destination, `${destination}.axm-staging`, `${destination}.axm-backup`]),
      );
      for (const target of [destination, `${destination}.axm-staging`, `${destination}.axm-backup`])
        expect({
          target,
          stat: recording.calls({ path: target, method: "stat" }).length,
          readLink: recording.calls({ path: target, method: "readLink" }).length,
        }).toEqual({ target, stat: 1, readLink: 2 });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("resolves an accepted destination once when the same package is selected again", () =>
    Effect.gen(function* () {
      const { outcome, recording, destination } = yield* preflight([ref("1.0.0")], [], {
        lockfile: acceptedReview,
        arrange: (acquiredRoot) =>
          nodeFs.mkdirSync(
            nodePath.join(acquiredRoot, "registry.example.test", "@acme", "skills", "review"),
            { recursive: true },
          ),
      });
      expect(outcome).toEqual(Result.succeed([destination]));
      expect(recording.counts(destination)).toEqual({ readLink: 1, stat: 1, realPath: 1 });
      expect(recording.calls({ path: `${destination}.axm-staging` })).toEqual([]);
      expect(recording.calls({ path: `${destination}.axm-backup` })).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("names the first claim of a repeated package when an alias overlaps it", () =>
    Effect.gen(function* () {
      const { outcome, destination, address } = yield* preflight([ref("1.0.0"), otherRef()], [], {
        lockfile: acceptedReview,
        arrange: (acquiredRoot) => {
          const review = nodePath.join(
            acquiredRoot,
            "registry.example.test",
            "@acme",
            "skills",
            "review",
          );
          const alias = nodePath.join(
            acquiredRoot,
            "registry.example.test",
            "@other",
            "skills",
            "review",
          );
          nodeFs.mkdirSync(review, { recursive: true });
          nodeFs.mkdirSync(nodePath.dirname(alias), { recursive: true });
          nodeFs.symlinkSync(review, alias);
        },
      });
      const otherClaim = packageAddressClaimForRef(otherRef());
      const reviewClaim = packageAddressClaimForRef(ref("1.0.0"));
      if (Result.isFailure(otherClaim) || Result.isFailure(reviewClaim))
        throw new Error("fixture refs must have addresses");
      expect(address(otherRef())).not.toBe(destination);
      expect(outcome).toEqual(
        Result.fail(
          expect.objectContaining({
            category: "conflict",
            detail: `Retained package source addresses overlap through filesystem aliases: ${reviewClaim.success.packageKey} at ${nodeFs.realpathSync(destination)} and ${otherClaim.success.packageKey} at ${otherClaim.success.address}`,
          }),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("still refuses scratch content beside a package selected twice", () =>
    Effect.gen(function* () {
      const { outcome, destination } = yield* preflight([ref("1.1.0")], [ref("1.0.0")], {
        arrange: (acquiredRoot) =>
          nodeFs.mkdirSync(
            nodePath.join(
              acquiredRoot,
              "registry.example.test",
              "@acme",
              "skills",
              "review.axm-backup",
            ),
            { recursive: true },
          ),
      });
      const claim = packageAddressClaimForRef(ref("1.0.0"));
      if (Result.isFailure(claim)) throw new Error(claim.failure.detail);
      expect(nodeFs.existsSync(`${destination}.axm-backup`)).toBe(true);
      expect(outcome).toEqual(
        Result.fail(
          expect.objectContaining({
            category: "conflict",
            detail: `Retained package destination ${claim.success.address}.axm-backup contains content without accepted ownership; move it before installing this source`,
          }),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});

describe("one placement preflight over a local source listed by several refs", () => {
  const localRef = (directory: string, name = "review"): LocalSkillRef => ({
    type: "skill",
    refType: "local",
    owner: decodeHandleSync("@acme"),
    name: decodeExtensionNameSync(name),
    skill: {
      name: decodeExtensionNameSync(name),
      description: Option.none(),
      metadata: Option.none(),
    },
    source: { type: "local", path: directory },
    location: pathToFileURL(directory).href,
  });

  /** Run one preflight through a recording port over real temporary package directories. */
  const preflight = (
    refs: (sources: { readonly first: string; readonly second: string }) => {
      readonly acquisition: ReadonlyArray<LocalSkillRef>;
      readonly exposure: ReadonlyArray<LocalSkillRef>;
    },
  ) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const workspace = yield* makeSpecWorkspace("axm-placement-local-");
      // Physical spelling, so the lexical and resolved paths coincide on every host.
      const root = nodeFs.realpathSync(workspace.root);
      const first = path.join(root, "sources", "review");
      const second = path.join(root, "sources", "lint");
      for (const directory of [first, second]) {
        nodeFs.mkdirSync(directory, { recursive: true });
        nodeFs.writeFileSync(path.join(directory, "SKILL.md"), "# Skill\n");
      }
      const { acquisition, exposure } = refs({ first, second });
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const outcome = yield* preflightPackagePlacement(acquisition, exposure).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provide(WorkspaceReadTest({ baseDir: root, runtimeDir: path.join(root, ".axm") })),
        Effect.result,
      );
      const resolutions = (target: string) => {
        const counts = recording.counts(target);
        return { readLink: counts.readLink, stat: counts.stat, realPath: counts.realPath };
      };
      return { outcome, recording, first, second, resolutions };
    });

  it.effect("resolves a source listed by its acquisition and two exposures once", () =>
    Effect.gen(function* () {
      const { outcome, first, resolutions } = yield* preflight(({ first }) => ({
        acquisition: [localRef(first)],
        exposure: [
          localRef(first),
          {
            ...localRef(first),
            skill: { ...localRef(first).skill, description: Option.some("x") },
          },
        ],
      }));
      expect(Result.isSuccess(outcome) && outcome.success[0]).toBe(first);
      expect(resolutions(first)).toEqual({ readLink: 1, stat: 1, realPath: 1 });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("resolves a source listed by its acquisition and one exposure once", () =>
    Effect.gen(function* () {
      const { outcome, first, resolutions } = yield* preflight(({ first }) => ({
        acquisition: [localRef(first)],
        exposure: [localRef(first)],
      }));
      expect(Result.isSuccess(outcome) && outcome.success[0]).toBe(first);
      expect(resolutions(first)).toEqual({ readLink: 1, stat: 1, realPath: 1 });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("returns the same placement paths as a preflight that lists the source once", () =>
    Effect.gen(function* () {
      const once = yield* preflight(({ first }) => ({
        acquisition: [localRef(first)],
        exposure: [],
      }));
      const repeated = yield* preflight(({ first }) => ({
        acquisition: [localRef(first)],
        exposure: [localRef(first), localRef(first)],
      }));
      // Each preflight runs in its own workspace; compare paths with that root elided.
      const elided = (first: string, outcome: typeof once.outcome) => {
        const root = nodePath.dirname(nodePath.dirname(first));
        return Result.map(outcome, (paths) =>
          paths.map((target) => target.split(root).join("<root>")),
        );
      };
      expect(elided(repeated.first, repeated.outcome)).toEqual(elided(once.first, once.outcome));
      expect(Result.map(elided(once.first, once.outcome), (paths) => paths.length)).toEqual(
        Result.succeed(4),
      );
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("still resolves each distinct source once", () =>
    Effect.gen(function* () {
      const { outcome, first, second, resolutions } = yield* preflight(({ first, second }) => ({
        acquisition: [localRef(first), localRef(second, "lint")],
        exposure: [localRef(first), localRef(second, "lint")],
      }));
      expect(Result.isSuccess(outcome)).toBe(true);
      expect(resolutions(first)).toEqual({ readLink: 1, stat: 1, realPath: 1 });
      expect(resolutions(second)).toEqual({ readLink: 1, stat: 1, realPath: 1 });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("reads nothing when no ref is selected", () =>
    Effect.gen(function* () {
      const { outcome, recording } = yield* preflight(() => ({ acquisition: [], exposure: [] }));
      expect(outcome).toEqual(Result.succeed([]));
      expect(recording.calls()).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
