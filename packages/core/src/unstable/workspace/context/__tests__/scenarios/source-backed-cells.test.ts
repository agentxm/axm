/**
 * Scenario: Source-backed cells distinguish absent state from invalid state.
 *
 * Spec requirement coverage:
 *
 * - Missing settings → `Effect.succeed(Option.none())` on `state.settings`
 *   and `skills.declared`.
 * - Invalid settings (byte-corrupt) → `Effect.fail(SettingsReadError)` on the
 *   same cells, and the failure tag set is a subset of the three settings
 *   tags (`SettingsIoError | SettingsParseError | SettingsDecodeError`).
 * - Missing project lockfile → `Option.none()` on `state.lockfile` and
 *   `skills.resolved`.
 * - Invalid project lockfile → `Effect.fail(LockfileReadError)`; tag set
 *   subset of the three lockfile tags.
 * - User lockfile cell is permanently `Option.none()` (no failure path).
 * - The ≤3-tag quality constraint per cell is asserted via `Effect.exit` +
 *   `tagsOf`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import {
  absentAll,
  lockfileInvalidOnly,
  settingsInvalidOnly,
  validAll,
} from "../../__fixtures__/builder.js";
import {
  expectSuccess,
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
  tagsOf,
  withResult,
} from "./_harness.js";

const SETTINGS_TAGS: ReadonlySet<string> = new Set([
  "SettingsIoError",
  "SettingsParseError",
  "SettingsDecodeError",
]);

const LOCKFILE_TAGS: ReadonlySet<string> = new Set([
  "LockfileIoError",
  "LockfileParseError",
  "LockfileDecodeError",
]);

describe("source-backed cells", () => {
  describe("settings absent vs invalid", () => {
    it.effect("missing settings → Option.none() on state.settings", () =>
      runScenario(absentAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const success = expectSuccess(yield* withResult(ctx.scope("project").state.settings));
          expect(Option.isNone(success)).toBe(true);
        }),
      ),
    );

    it.effect("missing settings → Option.none() on skills.declared", () =>
      runScenario(absentAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const success = expectSuccess(yield* withResult(ctx.scope("project").skills.declared));
          expect(Option.isNone(success)).toBe(true);
        }),
      ),
    );

    it.effect("byte-corrupt settings → SettingsReadError on state.settings", () =>
      runScenario(settingsInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(ctx.scope("project").state.settings);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const tags = tagsOf(exit.cause);
            // ≤3 tagged-error tags, all in the settings family.
            expect(tags.size).toBeGreaterThan(0);
            expect(tags.size).toBeLessThanOrEqual(3);
            for (const tag of tags) {
              expect(SETTINGS_TAGS.has(tag)).toBe(true);
            }
          }
        }),
      ),
    );

    it.effect("byte-corrupt settings → SettingsReadError on skills.declared", () =>
      runScenario(settingsInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(ctx.scope("project").skills.declared);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const tags = tagsOf(exit.cause);
            expect(tags.size).toBeGreaterThan(0);
            expect(tags.size).toBeLessThanOrEqual(3);
            for (const tag of tags) {
              expect(SETTINGS_TAGS.has(tag)).toBe(true);
            }
          }
        }),
      ),
    );
  });

  describe("project lockfile absent vs invalid", () => {
    it.effect("missing project lockfile → Option.none() on state.lockfile", () =>
      runScenario(absentAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const success = expectSuccess(yield* withResult(ctx.scope("project").state.lockfile));
          expect(Option.isNone(success)).toBe(true);
        }),
      ),
    );

    it.effect("missing project lockfile → Option.none() on skills.resolved", () =>
      runScenario(absentAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const success = expectSuccess(yield* withResult(ctx.scope("project").skills.resolved));
          expect(Option.isNone(success)).toBe(true);
        }),
      ),
    );

    it.effect("byte-corrupt project lockfile → LockfileReadError on state.lockfile", () =>
      runScenario(lockfileInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(ctx.scope("project").state.lockfile);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const tags = tagsOf(exit.cause);
            expect(tags.size).toBeGreaterThan(0);
            expect(tags.size).toBeLessThanOrEqual(3);
            for (const tag of tags) {
              expect(LOCKFILE_TAGS.has(tag)).toBe(true);
            }
          }
        }),
      ),
    );

    it.effect("byte-corrupt project lockfile → LockfileReadError on skills.resolved", () =>
      runScenario(lockfileInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(ctx.scope("project").skills.resolved);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const tags = tagsOf(exit.cause);
            expect(tags.size).toBeGreaterThan(0);
            expect(tags.size).toBeLessThanOrEqual(3);
            for (const tag of tags) {
              expect(LOCKFILE_TAGS.has(tag)).toBe(true);
            }
          }
        }),
      ),
    );
  });

  describe("user lockfile is degenerate", () => {
    it.effect("user state.lockfile is permanently Option.none() with no failure path", () =>
      runScenario(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const success = expectSuccess(yield* withResult(ctx.scope("user").state.lockfile));
          expect(Option.isNone(success)).toBe(true);
        }),
      ),
    );

    it.effect("user skills.resolved is permanently Option.none()", () =>
      runScenario(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
        Effect.gen(function* () {
          const success = expectSuccess(yield* withResult(ctx.scope("user").skills.resolved));
          expect(Option.isNone(success)).toBe(true);
        }),
      ),
    );
  });
});
