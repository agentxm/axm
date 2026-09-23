import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";

import { createLocalRegistryClient } from "./local-client.js";
import { extensionName, handle } from "./test-helpers.js";

const nameAt = (index: number) => `extension-${String(index).padStart(3, "0")}`;
const indexPath = (index: number) =>
  `/registry/extensions/@owner-0/skills/${nameAt(index)}/index.json`;
const indexJson = (owner: string, type: string, name: string, empty = false) =>
  JSON.stringify({
    owner,
    type,
    name,
    publisherBindingId: "hbnd_fixture",
    archival: null,
    deprecation: null,
    versions: empty
      ? []
      : [{ version: "1.0.0", published: "2025-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" }],
  });
const ioError = (location: string, method = "readFileString") =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    pathOrDescriptor: location,
    description: "fixture permission denied",
  });

const makeRegistry = (owners = 1, names = 40) => {
  const directories = new Map<string, ReadonlyArray<string>>();
  const files = new Map<string, string>();
  const ownerNames = Array.from({ length: owners }, (_, index) => `@owner-${index}`);
  directories.set("/registry/extensions", ownerNames);
  for (const owner of ownerNames) {
    directories.set(`/registry/extensions/${owner}`, ["skills", "rules", "subagents"]);
    for (const [plural, type] of [
      ["skills", "skill"],
      ["rules", "rule"],
      ["subagents", "subagent"],
    ] as const) {
      const entries = Array.from({ length: names }, (_, index) => nameAt(index));
      directories.set(`/registry/extensions/${owner}/${plural}`, entries);
      for (const name of entries) {
        files.set(
          `/registry/extensions/${owner}/${plural}/${name}/index.json`,
          indexJson(owner, type, name),
        );
      }
    }
  }
  const fs = FileSystem.makeNoop({
    readDirectory: (location) => Effect.succeed([...(directories.get(location) ?? [])]),
    exists: (location) => Effect.succeed(files.has(location) || directories.has(location)),
    readFileString: (location) => {
      const content = files.get(location);
      return content === undefined
        ? Effect.fail(
            PlatformError.systemError({
              _tag: "NotFound",
              module: "FileSystem",
              method: "readFileString",
              pathOrDescriptor: location,
            }),
          )
        : Effect.succeed(content);
    },
  });
  return { fs, files, directories };
};

const selection = {
  owner: handle("@owner-0"),
  names: [],
  types: ["skill"],
  limit: Option.none(),
  offset: 0,
} as const;

describe("local registry enumeration", () => {
  it.effect.each(["owner", "wildcard"] as const)(
    "bounds the entire %s enumeration rather than each nesting level",
    (scenario) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fixture = makeRegistry(8, 32);
        const metrics = yield* Ref.make<{
          active: number;
          peak: number;
          directories: ReadonlyArray<string>;
        }>({ active: 0, peak: 0, directories: [] });
        const observe = <A, E>(location: string | undefined, operation: Effect.Effect<A, E>) =>
          Effect.acquireUseRelease(
            Ref.update(metrics, (state) => ({
              active: state.active + 1,
              peak: Math.max(state.peak, state.active + 1),
              directories:
                location === undefined ? state.directories : [...state.directories, location],
            })),
            () => Effect.yieldNow.pipe(Effect.andThen(operation)),
            () => Ref.update(metrics, (state) => ({ ...state, active: state.active - 1 })),
          );
        const fs: FileSystem.FileSystem = {
          ...fixture.fs,
          readDirectory: (location) => observe(location, fixture.fs.readDirectory(location)),
          exists: (location) => observe(undefined, fixture.fs.exists(location)),
          readFileString: (location) => observe(undefined, fixture.fs.readFileString(location)),
        };
        const result = yield* createLocalRegistryClient("/registry", fs, path).getExtensionsByScope(
          {
            ...selection,
            owner: scenario === "wildcard" ? "*" : selection.owner,
            names:
              scenario === "wildcard"
                ? []
                : Array.from({ length: 32 }, (_, index) => extensionName(nameAt(index))),
            types: ["skill", "rule", "subagent"],
          },
        );
        const observed = yield* Ref.get(metrics);
        expect(result.total).toBe(scenario === "wildcard" ? 768 : 96);
        expect(observed.active).toBe(0);
        expect(observed.peak).toBe(20);
        // Each physical type directory is enumerated once, regardless of selectors.
        expect(new Set(observed.directories).size).toBe(observed.directories.length);
        if (scenario === "owner") expect(observed.directories).toHaveLength(3);
      }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("keeps repeated selectors, requested type order, total, and pagination", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fixture = makeRegistry(1, 3);
      const client = createLocalRegistryClient("/registry", fixture.fs, path);
      const args = {
        ...selection,
        names: [extensionName(nameAt(2)), extensionName(nameAt(0)), extensionName(nameAt(2))],
        types: ["rule", "skill", "rule"] as const,
      };
      const all = yield* client.getExtensionsByScope(args);
      const identities = all.extensions.map((entry) => `${entry.type}/${entry.name}`);
      expect(identities).toEqual([
        `rule/${nameAt(2)}`,
        `skill/${nameAt(2)}`,
        `rule/${nameAt(2)}`,
        `rule/${nameAt(0)}`,
        `skill/${nameAt(0)}`,
        `rule/${nameAt(0)}`,
        `rule/${nameAt(2)}`,
        `skill/${nameAt(2)}`,
        `rule/${nameAt(2)}`,
      ]);
      const page = yield* client.getExtensionsByScope({
        ...args,
        offset: 2,
        limit: Option.some(4),
      });
      expect(page.total).toBe(9);
      expect(page.extensions).toEqual(all.extensions.slice(2, 6));
      expect(page.indexes).toEqual(all.indexes.slice(2, 6));
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("keeps wildcard owner/type/name order and skips absent or empty indexes", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fixture = makeRegistry(2, 3);
      fixture.files.delete(indexPath(0));
      fixture.files.set(indexPath(1), indexJson("@owner-0", "skill", nameAt(1), true));
      const client = createLocalRegistryClient("/registry", fixture.fs, path);
      const all = yield* client.getExtensionsByScope({ ...selection, owner: "*", types: [] });
      expect(all.total).toBe(16);
      expect(all.extensions.map((entry) => `${entry.owner}/${entry.type}/${entry.name}`)).toEqual(
        ["@owner-0", "@owner-1"]
          .flatMap((owner) =>
            ["skill", "rule", "subagent"].flatMap((type) =>
              [nameAt(0), nameAt(1), nameAt(2)].map((name) => `${owner}/${type}/${name}`),
            ),
          )
          .slice(2),
      );
      const page = yield* client.getExtensionsByScope({
        ...selection,
        owner: "*",
        types: [],
        offset: 7,
        limit: Option.some(5),
      });
      expect(page.total).toBe(16);
      expect(page.extensions).toEqual(all.extensions.slice(7, 12));
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("keeps result order when index reads finish in reverse order", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fixture = makeRegistry(1, 2);
      const secondRead = yield* Deferred.make<void>();
      const fs: FileSystem.FileSystem = {
        ...fixture.fs,
        readFileString: (location) =>
          (location === indexPath(0)
            ? Deferred.await(secondRead)
            : Deferred.succeed(secondRead, undefined)
          ).pipe(Effect.andThen(fixture.fs.readFileString(location))),
      };
      const result = yield* createLocalRegistryClient("/registry", fs, path).getExtensionsByScope(
        selection,
      );
      expect(result.extensions.map((entry) => entry.name)).toEqual([nameAt(0), nameAt(1)]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect.each(["directory", "index", "schema"] as const)(
    "reports %s failure instead of a partial catalog",
    (kind) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fixture = makeRegistry();
        const denied = ioError(
          kind === "directory" ? "/registry/extensions/@owner-0/skills" : indexPath(0),
          kind === "directory" ? "readDirectory" : "readFileString",
        );
        const fs: FileSystem.FileSystem = {
          ...fixture.fs,
          readDirectory: (location) =>
            kind === "directory" ? Effect.fail(denied) : fixture.fs.readDirectory(location),
          readFileString: (location) =>
            location !== indexPath(0)
              ? fixture.fs.readFileString(location)
              : kind === "schema"
                ? Effect.succeed("invalid json")
                : Effect.fail(denied),
        };
        const failure = yield* createLocalRegistryClient("/registry", fs, path)
          .getExtensionsByScope(selection)
          .pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: "RegistryOperationFailed", category: "internal" });
        if (kind !== "schema" && failure._tag === "RegistryOperationFailed")
          expect(failure.cause).toBe(denied);
      }).pipe(Effect.provide(Path.layer)),
  );

  it.effect.each(["failure", "interruption"] as const)(
    "awaits active cleanup and never starts queued indexes after %s",
    (kind) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fixture = makeRegistry();
        const started = yield* Ref.make<ReadonlyArray<string>>([]);
        const cleaned = yield* Ref.make<ReadonlyArray<string>>([]);
        const done = yield* Ref.make(false);
        const firstWave = yield* Deferred.make<void>();
        const cleaning = yield* Deferred.make<void>();
        const finishCleanup = yield* Deferred.make<void>();
        const denied = ioError(indexPath(0));
        const fs: FileSystem.FileSystem = {
          ...fixture.fs,
          readFileString: (location) =>
            Effect.gen(function* () {
              const active = yield* Ref.updateAndGet(started, (entries) => [...entries, location]);
              if (active.length === 20) yield* Deferred.succeed(firstWave, undefined);
              if (kind === "failure" && location === indexPath(0)) {
                yield* Deferred.await(firstWave);
                return yield* denied;
              }
              return yield* Effect.never;
            }).pipe(
              Effect.ensuring(
                Effect.gen(function* () {
                  if (location === indexPath(1)) {
                    yield* Deferred.succeed(cleaning, undefined);
                    yield* Deferred.await(finishCleanup);
                  }
                  yield* Ref.update(cleaned, (entries) => [...entries, location]);
                }),
              ),
            ),
        };
        const task = yield* createLocalRegistryClient("/registry", fs, path)
          .getExtensionsByScope(selection)
          .pipe(
            Effect.onExit(() => Ref.set(done, true)),
            Effect.forkChild,
          );
        yield* Deferred.await(firstWave);
        const interrupt =
          kind === "interruption" ? yield* Fiber.interrupt(task).pipe(Effect.forkChild) : undefined;
        yield* Deferred.await(cleaning);
        const doneBeforeCleanup = yield* Ref.get(done);
        const startedBeforeCleanup = yield* Ref.get(started);
        yield* Deferred.succeed(finishCleanup, undefined);
        if (interrupt !== undefined) yield* Fiber.join(interrupt);
        const exit = yield* Fiber.await(task);
        expect(doneBeforeCleanup).toBe(false);
        expect(startedBeforeCleanup).toEqual(
          Array.from({ length: 20 }, (_, index) => indexPath(index)),
        );
        expect(yield* Ref.get(cleaned)).toHaveLength(20);
        expect(yield* Ref.get(done)).toBe(true);
        if (kind === "interruption") expect(Exit.hasInterrupts(exit)).toBe(true);
        else {
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit))
            expect(Cause.findErrorOption(exit.cause)).toEqual(
              Option.some(
                expect.objectContaining({ _tag: "RegistryOperationFailed", cause: denied }),
              ),
            );
        }
      }).pipe(Effect.scoped, Effect.provide(Path.layer)),
  );
});
