/**
 * Tests for `makeScopedStateApi` — the cached, requirement-free settings and
 * lockfile loaders that back every WorkspaceReadModel source-backed cell.
 *
 * Covers, for each (scope, source) pair:
 *
 * - absent file        → `Effect.succeed(Option.none())`
 * - IO failure         → `Effect.fail(SettingsIoError | LockfileIoError)`
 * - parse failure      → `*ParseError`
 * - schema decode      → `*DecodeError`
 * - user-scope lockfile permanently `Option.none()`
 * - `Effect.cached` semantics: two `yield*`-s of the same scoped source share
 *   one execution and one IO call, asserted via a counter on the test
 *   `FileSystem`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { LOCKFILE_NAME } from "../../../lockfile/lockfile.js";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
} from "../errors.js";
import { makeScopedStateApi, type ScopedStateLoaders } from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = "/ws";
const SETTINGS_PATH = `${WORKSPACE_ROOT}/.axm/settings.json`;
// Production places the lockfile at the workspace root (no `.axm/`),
// matching `makeWorkspaceReadModel`'s wiring in `service.ts`.
const LOCKFILE_PATH = `${WORKSPACE_ROOT}/${LOCKFILE_NAME}`;

interface FsCounters {
  readonly exists: Ref.Ref<number>;
  readonly read: Ref.Ref<number>;
}

interface FsBehavior {
  readonly readers: Readonly<
    Record<string, () => Effect.Effect<string, PlatformError.PlatformError>>
  >;
  readonly missing: ReadonlySet<string>;
  readonly existsFails: ReadonlySet<string>;
}

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystem",
    method,
    description: "No such file or directory",
    pathOrDescriptor: path,
  });

const ioFailure = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    description: "permission denied",
    pathOrDescriptor: path,
  });

const buildFs = (behavior: FsBehavior, counters: FsCounters): FileSystem.FileSystem =>
  FileSystem.makeNoop({
    exists: (path) =>
      Effect.gen(function* () {
        yield* Ref.update(counters.exists, (n) => n + 1);
        if (behavior.existsFails.has(path)) {
          return yield* ioFailure("exists", path);
        }
        if (behavior.missing.has(path)) {
          return false;
        }
        return path in behavior.readers;
      }),
    readFileString: (path) =>
      Effect.gen(function* () {
        yield* Ref.update(counters.read, (n) => n + 1);
        const reader = behavior.readers[path];
        if (reader === undefined) {
          return yield* notFound("readFileString", path);
        }
        return yield* reader();
      }),
  });

const makeCounters: Effect.Effect<FsCounters> = Effect.gen(function* () {
  const exists = yield* Ref.make(0);
  const read = yield* Ref.make(0);
  return { exists, read };
});

const makeApi = (
  scope: "project" | "user",
  fs: FileSystem.FileSystem,
  options?: { readonly lockfilePath?: string | null },
): Effect.Effect<ScopedStateLoaders> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* makeScopedStateApi(scope, {
      fs,
      path,
      settingsPath: SETTINGS_PATH,
      lockfilePath:
        options?.lockfilePath !== undefined
          ? options.lockfilePath
          : scope === "user"
            ? null
            : LOCKFILE_PATH,
    });
  }).pipe(Effect.provide(Path.layer));

// ---------------------------------------------------------------------------
// Settings cell
// ---------------------------------------------------------------------------

describe("makeScopedStateApi.settings", () => {
  it.effect("returns Option.none() when settings file is absent", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        { readers: {}, missing: new Set([SETTINGS_PATH]), existsFails: new Set() },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const result = yield* api.settings;
      expect(Option.isNone(result)).toBe(true);

      // Read SHOULD NOT be attempted when the file is absent.
      const reads = yield* Ref.get(counters.read);
      expect(reads).toBe(0);
    }),
  );

  it.effect("returns Option.some(decoded) when settings file is valid", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {
            [SETTINGS_PATH]: () =>
              Effect.succeed(JSON.stringify({ owner: "@team", agents: ["claude-code"] })),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const result = yield* api.settings;
      expect(Option.isSome(result)).toBe(true);
      const value = Option.getOrThrow(result);
      expect(value.owner).toBe("@team");
      expect(value.agents).toEqual(["claude-code"]);
    }),
  );

  it.effect("fails with SettingsIoError when filesystem read fails", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {
            [SETTINGS_PATH]: () => Effect.fail(ioFailure("readFileString", SETTINGS_PATH)),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.settings);
      expect(err).toBeInstanceOf(SettingsIoError);
      expect(err._tag).toBe("SettingsIoError");
      expect(err.path).toBe(SETTINGS_PATH);
    }),
  );

  it.effect("fails with SettingsIoError when fs.exists itself fails", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {},
          missing: new Set(),
          existsFails: new Set([SETTINGS_PATH]),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.settings);
      expect(err).toBeInstanceOf(SettingsIoError);
      expect(err._tag).toBe("SettingsIoError");
      expect(err.path).toBe(SETTINGS_PATH);
    }),
  );

  it.effect("fails with SettingsParseError when settings is not valid JSON", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const raw = "{ this is not json";
      const fs = buildFs(
        {
          readers: { [SETTINGS_PATH]: () => Effect.succeed(raw) },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.settings);
      expect(err).toBeInstanceOf(SettingsParseError);
      if (err._tag === "SettingsParseError") {
        expect(err.path).toBe(SETTINGS_PATH);
        expect(err.raw).toBe(raw);
      }
    }),
  );

  it.effect("fails with SettingsDecodeError when settings JSON does not match the schema", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      // `agents` SHALL be an array of agent ids; a string violates the schema.
      const fs = buildFs(
        {
          readers: {
            [SETTINGS_PATH]: () => Effect.succeed(JSON.stringify({ agents: "not-an-array" })),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.settings);
      expect(err).toBeInstanceOf(SettingsDecodeError);
      if (err._tag === "SettingsDecodeError") {
        expect(err.path).toBe(SETTINGS_PATH);
        expect(err.issues.length).toBeGreaterThan(0);
      }
    }),
  );

  it.effect("fails with SettingsDecodeError for legacy ignored settings", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {
            [SETTINGS_PATH]: () =>
              Effect.succeed(JSON.stringify({ ignored: { skills: ["legacy-*"] } })),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.settings);
      expect(err).toBeInstanceOf(SettingsDecodeError);
      if (err._tag === "SettingsDecodeError") {
        expect(err.issues).toEqual([
          "ignored: Legacy settings key is no longer supported; use feature config siblings such as skillsConfig.ignore",
        ]);
      }
    }),
  );

  it.effect("Effect.cached: two yield*-s share one execution and one IO call", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {
            [SETTINGS_PATH]: () => Effect.succeed(JSON.stringify({ owner: "@team" })),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const first = yield* api.settings;
      const second = yield* api.settings;

      expect(Option.isSome(first)).toBe(true);
      expect(Option.isSome(second)).toBe(true);

      // Counter assertion: cached cells SHALL re-issue at most one read.
      expect(yield* Ref.get(counters.read)).toBe(1);
      expect(yield* Ref.get(counters.exists)).toBe(1);
    }),
  );

  it.effect("user-scope settings reads from the user-scope settings path", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {
            [SETTINGS_PATH]: () => Effect.succeed(JSON.stringify({ owner: "@user" })),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("user", fs);

      const result = yield* api.settings;
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result).owner).toBe("@user");
    }),
  );
});

// ---------------------------------------------------------------------------
// Lockfile cell
// ---------------------------------------------------------------------------

const validLockfileYaml = ["lockfileVersion: 1", "skills: {}", ""].join("\n");

describe("makeScopedStateApi.lockfile", () => {
  it.effect("returns Option.none() when lockfile is absent in project scope", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        { readers: {}, missing: new Set([LOCKFILE_PATH]), existsFails: new Set() },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const result = yield* api.lockfile;
      expect(Option.isNone(result)).toBe(true);
    }),
  );

  it.effect("returns Option.some(decoded) when project lockfile is valid", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: { [LOCKFILE_PATH]: () => Effect.succeed(validLockfileYaml) },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const result = yield* api.lockfile;
      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrThrow(result).lockfileVersion).toBe(2);
    }),
  );

  it.effect("fails with LockfileIoError when filesystem read fails", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {
            [LOCKFILE_PATH]: () => Effect.fail(ioFailure("readFileString", LOCKFILE_PATH)),
          },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.lockfile);
      expect(err).toBeInstanceOf(LockfileIoError);
      expect(err._tag).toBe("LockfileIoError");
      expect(err.path).toBe(LOCKFILE_PATH);
    }),
  );

  it.effect("fails with LockfileIoError when fs.exists itself fails", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: {},
          missing: new Set(),
          existsFails: new Set([LOCKFILE_PATH]),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.lockfile);
      expect(err).toBeInstanceOf(LockfileIoError);
      expect(err._tag).toBe("LockfileIoError");
    }),
  );

  it.effect("fails with LockfileParseError when lockfile is not valid YAML", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      // YAML mid-document break the parser deterministically rejects (an
      // unterminated flow sequence inside a mapping). Same shape used in
      // `scenarios/lint-axm454-closure.test.ts`.
      const raw = "lockfileVersion: [oh: no\nbroken: !! tags";
      const fs = buildFs(
        {
          readers: { [LOCKFILE_PATH]: () => Effect.succeed(raw) },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.lockfile);
      expect(err).toBeInstanceOf(LockfileParseError);
      expect(err.path).toBe(LOCKFILE_PATH);
    }),
  );

  it.effect("fails with LockfileDecodeError when lockfile YAML does not match the schema", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      // Parses as valid YAML but the resulting object lacks required fields
      // (`lockfileVersion`, `skills`).
      const raw = "unrelated: value\n";
      const fs = buildFs(
        {
          readers: { [LOCKFILE_PATH]: () => Effect.succeed(raw) },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const err = yield* Effect.flip(api.lockfile);
      expect(err).toBeInstanceOf(LockfileDecodeError);
      if (err._tag === "LockfileDecodeError") {
        expect(err.path).toBe(LOCKFILE_PATH);
        expect(err.issues.length).toBeGreaterThan(0);
      }
    }),
  );

  it.effect("Effect.cached: two yield*-s share one execution and one IO call", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      const fs = buildFs(
        {
          readers: { [LOCKFILE_PATH]: () => Effect.succeed(validLockfileYaml) },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("project", fs);

      const first = yield* api.lockfile;
      const second = yield* api.lockfile;

      expect(Option.isSome(first)).toBe(true);
      expect(Option.isSome(second)).toBe(true);

      expect(yield* Ref.get(counters.read)).toBe(1);
      expect(yield* Ref.get(counters.exists)).toBe(1);
    }),
  );

  it.effect("user-scope lockfile is permanently Option.none() and performs no IO", () =>
    Effect.gen(function* () {
      const counters = yield* makeCounters;
      // Even if a lockfile-shaped read would otherwise succeed, user scope
      // SHALL NOT touch the filesystem.
      const fs = buildFs(
        {
          readers: { [LOCKFILE_PATH]: () => Effect.succeed(validLockfileYaml) },
          missing: new Set(),
          existsFails: new Set(),
        },
        counters,
      );
      const api = yield* makeApi("user", fs);

      const a = yield* api.lockfile;
      const b = yield* api.lockfile;

      expect(Option.isNone(a)).toBe(true);
      expect(Option.isNone(b)).toBe(true);
      expect(yield* Ref.get(counters.read)).toBe(0);
      expect(yield* Ref.get(counters.exists)).toBe(0);
    }),
  );
});
