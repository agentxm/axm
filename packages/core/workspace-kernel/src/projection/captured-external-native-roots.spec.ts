import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { NativeWriteAuthority } from "../agent-adapters/index.js";
import { makeWorkspaceTransactionScope, WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceLocation } from "../workspace-state/index.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { NativeWriteAuthorityLive } from "./live.js";

export const specification = defineSpecification({
  requirement: "workspace/locations/captured-external-native-roots",
  title: "Explicit captured user roots grant bounded physical native authority",
  statement:
    "A documented user native root captured outside the home directory shall permit its bounded native mutations and exact eligible withdrawal, while root retargeting, independent workspace claims, undeclared siblings, and missing ancestors beyond that root shall be refused; foreign entries and rollback identities shall be preserved.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real directories, aliases, and admitted transactions distinguish root selection from arbitrary filesystem authority.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const parent = yield* fs.makeTempDirectoryScoped();
  const home = path.join(parent, "home");
  const external = path.join(parent, "vendor");
  yield* fs.makeDirectory(home);
  const workspaceDir = path.join(home, ".axm");
  const location = Layer.effect(
    WorkspaceLocation,
    Effect.map(WorkspaceLocation, (current) => ({
      ...current,
      scope: "user" as const,
      nativeDirectoryInputs: {
        skillsDirectoryOverrides: {},
        userConfigRootOverrides: { codex: external },
      },
    })),
  ).pipe(Layer.provide(WorkspaceReadTest({ baseDir: home })));
  const authority = NativeWriteAuthorityLive.pipe(
    Layer.provide(Layer.merge(location, WorkspaceFileWriteLocksLive)),
  );
  const command = <A, E, R>(transition: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const scope = yield* makeWorkspaceTransactionScope({
        nativeRoot: home,
        nativeRoots: [home, external],
        workspaceDir,
        settingsPath: path.join(home, "axm.json"),
        lockPath: path.join(home, "axm-lock.yaml"),
      });
      return yield* scope.run({
        claimDefaultTargets: false,
        transition,
        validate: () => Effect.void,
      });
    }).pipe(Effect.provide(authority));
  const target = { path: path.join(external, "native.json"), unit: "new-native-route" };
  const raw = '{"owned":true}';
  const insert = Effect.gen(function* () {
    const writer = yield* NativeWriteAuthority;
    const capture = yield* writer.captureInsertion({
      ...target,
      beforeRaw: Option.none(),
      eligible: true,
    });
    yield* writer.protect(target.path);
    const createdDirectories = yield* writer.createParentDirectories(target.path);
    yield* fs.writeFileString(target.path, raw);
    yield* writer.record({ path: target.path, change: "created" });
    yield* writer.recordInsertion({ capture, afterRaw: raw, createdDirectories });
  });
  const withdraw = Effect.gen(function* () {
    const writer = yield* NativeWriteAuthority;
    return yield* writer.retireInsertion({ ...target, raw, empty: false });
  });
  return { fs, path, parent, home, external, target, raw, authority, command, insert, withdraw };
});

describe("captured external native roots", () => {
  it.effect(
    "expires external native cleanup proof when the owning workspace is copied at the same path",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        yield* f.command(f.insert);
        const original = f.path.join(f.parent, "retained-home");
        yield* f.fs.rename(f.home, original);
        yield* f.fs.copy(original, f.home);
        expect(yield* f.command(f.withdraw)).toBe(false);
        expect(yield* f.fs.readFileString(f.target.path)).toBe(f.raw);
        expect(yield* f.fs.exists(f.external)).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "recognizes the selected user workspace beneath home while refusing a separate home project",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const owner = f.path.join(f.home, ".axm", "workspace");
        yield* f.fs.makeDirectory(owner, { recursive: true });
        const location = Layer.effect(
          WorkspaceLocation,
          Effect.map(WorkspaceLocation, (current) => ({ ...current, scope: "user" as const })),
        ).pipe(
          Layer.provide(
            WorkspaceReadTest({ baseDir: f.home, runtimeDir: f.path.join(owner, ".axm") }),
          ),
        );
        const authority = NativeWriteAuthorityLive.pipe(
          Layer.provide(Layer.merge(location, WorkspaceFileWriteLocksLive)),
        );
        yield* Effect.gen(function* () {
          const writer = yield* NativeWriteAuthority;
          yield* writer.protect(f.path.join(owner, "axm.json"));
          yield* f.fs.writeFileString(f.path.join(f.home, "axm.json"), "{}");
          expect(
            (yield* writer.protect(f.path.join(f.home, ".codex", "AGENTS.md")).pipe(Effect.result))
              ._tag,
          ).toBe("Failure");
        }).pipe(Effect.provide(authority));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const foreign of [false, true]) {
    it.effect(
      `withdraws a created external root with foreign entries ${foreign ? "retained" : "absent"}`,
      () =>
        Effect.gen(function* () {
          const f = yield* fixture;
          yield* f.fs.writeFileString(f.path.join(f.parent, "sibling.txt"), "foreign sibling");
          yield* f.command(f.insert);
          if (foreign)
            yield* f.fs.writeFileString(f.path.join(f.external, "notes.txt"), "foreign child");
          expect(yield* f.command(f.withdraw)).toBe(true);
          expect(yield* f.fs.exists(f.external)).toBe(foreign);
          expect(yield* f.fs.readFileString(f.path.join(f.parent, "sibling.txt"))).toBe(
            "foreign sibling",
          );
          if (foreign) expect(yield* f.fs.readDirectory(f.external)).toEqual(["notes.txt"]);
          expect(
            (yield* f.fs.readDirectory(f.parent)).some((name) => name.startsWith(".axm-retired-")),
          ).toBe(false);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect(
    "restores original external directory and file identities when withdrawal rolls back",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        yield* f.command(f.insert);
        const beforeDirectory = yield* f.fs.stat(f.external);
        const beforeFile = yield* f.fs.stat(f.target.path);
        const result = yield* f
          .command(f.withdraw.pipe(Effect.andThen(Effect.fail("later-failure"))))
          .pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") expect(result.failure).toBe("later-failure");
        expect((yield* f.fs.stat(f.external)).ino).toEqual(beforeDirectory.ino);
        expect((yield* f.fs.stat(f.target.path)).ino).toEqual(beforeFile.ino);
        expect(yield* f.fs.readFileString(f.target.path)).toBe(f.raw);
        expect(yield* f.command(f.withdraw)).toBe(true);
        expect(yield* f.fs.exists(f.external)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses an undeclared sibling and a native root claiming another workspace", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.fs.makeDirectory(f.external);
      yield* f.fs.writeFileString(f.path.join(f.external, "axm.json"), "{}");
      yield* Effect.gen(function* () {
        const writer = yield* NativeWriteAuthority;
        for (const target of [f.path.join(f.parent, "unregistered.json"), f.target.path]) {
          expect((yield* writer.protect(target).pipe(Effect.result))._tag).toBe("Failure");
          expect(yield* f.fs.exists(target)).toBe(false);
        }
      }).pipe(Effect.provide(f.authority));
      expect(yield* f.fs.readDirectory(f.external)).toEqual(["axm.json"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a captured root retargeted to another directory", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const initial = f.path.join(f.parent, "initial");
      const replacement = f.path.join(f.parent, "replacement");
      yield* f.fs.makeDirectory(initial);
      yield* f.fs.makeDirectory(replacement);
      yield* f.fs.symlink(initial, f.external);
      yield* Effect.gen(function* () {
        const writer = yield* NativeWriteAuthority;
        yield* f.fs.remove(f.external);
        yield* f.fs.symlink(replacement, f.external);
        expect((yield* writer.protect(f.target.path).pipe(Effect.result))._tag).toBe("Failure");
        expect(yield* f.fs.readDirectory(replacement)).toEqual([]);
      }).pipe(Effect.provide(f.authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses to create missing ancestors above an explicitly selected root", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const missing = f.path.join(f.parent, "missing");
      const root = f.path.join(missing, "selected");
      const location = Layer.effect(
        WorkspaceLocation,
        Effect.map(WorkspaceLocation, (current) => ({
          ...current,
          scope: "user" as const,
          nativeDirectoryInputs: {
            skillsDirectoryOverrides: {},
            userConfigRootOverrides: { codex: root },
          },
        })),
      ).pipe(Layer.provide(WorkspaceReadTest({ baseDir: f.home })));
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(Layer.merge(location, WorkspaceFileWriteLocksLive)),
      );
      yield* Effect.gen(function* () {
        const writer = yield* NativeWriteAuthority;
        expect(
          (yield* writer
            .createParentDirectories(f.path.join(root, "config.json"))
            .pipe(Effect.result))._tag,
        ).toBe("Failure");
        expect(yield* f.fs.exists(missing)).toBe(false);
      }).pipe(Effect.provide(authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
