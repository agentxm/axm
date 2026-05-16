/**
 * Source-independence tests for `makeScopedStateApi`.
 *
 * Decision 2 of the workspace read-model design specifies that source loaders
 * are independent: `state.settings` and `state.lockfile` SHALL each load
 * their own source without consulting the other, so corruption in one source
 * MUST NOT prevent the other source's cell from reading its own state.
 *
 * This file verifies that contract three ways:
 *
 * 1. With a corrupt `axm-lock.yaml`, `state.settings` succeeds with the
 *    decoded settings.
 * 2. With a corrupt `.axm/settings.json`, `state.lockfile` succeeds with the
 *    decoded lockfile.
 * 3. With either source corrupted, the other source's decoded value is
 *    bit-identical (by content) to a baseline read taken with both sources
 *    valid — establishing that a corrupt sibling does not mutate the good
 *    source's bytes or its decoded shape.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { LOCKFILE_NAME } from "../../../lockfile/lockfile.js";
import { LockfileParseError, SettingsParseError } from "../errors.js";
import { makeScopedStateApi, type ScopedStateLoaders } from "../state.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = "/ws";
const SETTINGS_PATH = `${WORKSPACE_ROOT}/.axm/settings.json`;
// Production places the lockfile at the workspace root (no `.axm/`),
// matching `makeWorkspaceReadModel`'s wiring in `service.ts`.
const LOCKFILE_PATH = `${WORKSPACE_ROOT}/${LOCKFILE_NAME}`;

const VALID_SETTINGS_JSON = JSON.stringify({
  owner: "@team",
  agents: ["claude-code"],
  skills: { "review-tool": { source: "github:owner/repo", enabled: true } },
});

const VALID_LOCKFILE_YAML = [
  "lockfileVersion: 1",
  "skills:",
  "  review-tool:",
  "    type: github",
  "    owner: owner",
  "    repo: repo",
  "    ref: main",
  "    installedAt: 2026-01-01T00:00:00.000Z",
  "    updatedAt: 2026-01-01T00:00:00.000Z",
  "    agents: []",
  "",
].join("\n");

const CORRUPT_SETTINGS_JSON = "{ this is not json";
// YAML mid-document break the parser deterministically rejects.
const CORRUPT_LOCKFILE_YAML = "lockfileVersion: [oh: no\nbroken: !! tags";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildFs = (files: Readonly<Record<string, string | "absent">>): FileSystem.FileSystem =>
  FileSystem.makeNoop({
    exists: (path) => Effect.succeed(files[path] !== undefined && files[path] !== "absent"),
    readFileString: (path) => {
      const value = files[path];
      if (value === undefined || value === "absent") {
        return Effect.fail(
          PlatformError.systemError({
            _tag: "NotFound",
            module: "FileSystem",
            method: "readFileString",
            description: "absent",
            pathOrDescriptor: path,
          }),
        );
      }
      return Effect.succeed(value);
    },
  });

const makeApi = (fs: FileSystem.FileSystem): Effect.Effect<ScopedStateLoaders> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* makeScopedStateApi("project", {
      fs,
      path,
      settingsPath: SETTINGS_PATH,
      lockfilePath: LOCKFILE_PATH,
    });
  }).pipe(Effect.provide(Path.layer));

// ---------------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------------

describe("source independence (Decision 2)", () => {
  it.effect("corrupt lockfile does not hide settings", () =>
    Effect.gen(function* () {
      const fs = buildFs({
        [SETTINGS_PATH]: VALID_SETTINGS_JSON,
        [LOCKFILE_PATH]: CORRUPT_LOCKFILE_YAML,
      });
      const api = yield* makeApi(fs);

      // Settings cell SHALL still resolve cleanly.
      const settings = yield* api.settings;
      expect(Option.isSome(settings)).toBe(true);
      const value = Option.getOrThrow(settings);
      expect(value.owner).toBe("@team");
      expect(value.agents).toEqual(["claude-code"]);
      expect(value.skills?.["review-tool"]).toEqual({
        source: "github:owner/repo",
        enabled: true,
        authored: false,
      });

      // Lockfile cell SHALL fail with `LockfileParseError` (deterministic
      // YAML rejection on the unterminated-flow corruption above).
      const lockfileErr = yield* Effect.flip(api.lockfile);
      expect(lockfileErr).toBeInstanceOf(LockfileParseError);
    }),
  );

  it.effect("corrupt settings does not hide lockfile state", () =>
    Effect.gen(function* () {
      const fs = buildFs({
        [SETTINGS_PATH]: CORRUPT_SETTINGS_JSON,
        [LOCKFILE_PATH]: VALID_LOCKFILE_YAML,
      });
      const api = yield* makeApi(fs);

      // Lockfile cell SHALL still resolve cleanly.
      const lockfile = yield* api.lockfile;
      expect(Option.isSome(lockfile)).toBe(true);
      const lf = Option.getOrThrow(lockfile);
      expect(lf.lockfileVersion).toBe(2);
      expect(Object.keys(lf.skills)).toContain("review-tool");

      // Settings cell SHALL fail with `SettingsParseError` (corrupt JSON).
      const settingsErr = yield* Effect.flip(api.settings);
      expect(settingsErr).toBeInstanceOf(SettingsParseError);
    }),
  );

  it.effect("decoded value of the unmutated source is bit-identical to a both-valid baseline", () =>
    Effect.gen(function* () {
      // Baseline: both sources valid.
      const fsBaseline = buildFs({
        [SETTINGS_PATH]: VALID_SETTINGS_JSON,
        [LOCKFILE_PATH]: VALID_LOCKFILE_YAML,
      });
      const baselineApi = yield* makeApi(fsBaseline);
      const baselineSettings = yield* baselineApi.settings;
      const baselineLockfile = yield* baselineApi.lockfile;

      // Variation 1: corrupt lockfile only — settings SHALL be identical.
      const fsCorruptLockfile = buildFs({
        [SETTINGS_PATH]: VALID_SETTINGS_JSON,
        [LOCKFILE_PATH]: CORRUPT_LOCKFILE_YAML,
      });
      const corruptLockfileApi = yield* makeApi(fsCorruptLockfile);
      const settingsWithCorruptLock = yield* corruptLockfileApi.settings;

      expect(Option.isSome(settingsWithCorruptLock)).toBe(true);
      expect(Option.isSome(baselineSettings)).toBe(true);
      // Bit-level identity by structural comparison: the unmutated source's
      // decoded value SHALL NOT differ across the two reads.
      expect(Option.getOrThrow(settingsWithCorruptLock)).toEqual(
        Option.getOrThrow(baselineSettings),
      );

      // Variation 2: corrupt settings only — lockfile SHALL be identical.
      const fsCorruptSettings = buildFs({
        [SETTINGS_PATH]: CORRUPT_SETTINGS_JSON,
        [LOCKFILE_PATH]: VALID_LOCKFILE_YAML,
      });
      const corruptSettingsApi = yield* makeApi(fsCorruptSettings);
      const lockfileWithCorruptSettings = yield* corruptSettingsApi.lockfile;

      expect(Option.isSome(lockfileWithCorruptSettings)).toBe(true);
      expect(Option.isSome(baselineLockfile)).toBe(true);
      expect(Option.getOrThrow(lockfileWithCorruptSettings)).toEqual(
        Option.getOrThrow(baselineLockfile),
      );
    }),
  );
});
