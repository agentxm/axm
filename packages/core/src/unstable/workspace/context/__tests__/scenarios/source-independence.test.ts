/**
 * Scenario: Source loading is independent.
 *
 * Spec requirement coverage:
 *
 * - Corrupt lockfile + valid settings → settings cell returns the same
 *   decoded value as the unmutated baseline.
 * - Corrupt settings + valid lockfile → lockfile cell returns the same
 *   decoded value as the unmutated baseline.
 * - Corrupt source on either side → actual scanner output is unaffected
 *   (bit-identical to baseline).
 *
 * These scenarios prove the type-system invariant: source loaders see only
 * `FileSystem` / `Path`; one source's bytes can never feed into another's
 * decoder.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { lockfileInvalidOnly, settingsInvalidOnly, validAll } from "../../__fixtures__/builder.js";
import {
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
  withResult,
} from "./_harness.js";

// ---------------------------------------------------------------------------
// Helpers — read snapshots from a fresh context
// ---------------------------------------------------------------------------

const readBaselineSettings = () =>
  runScenario(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
    Effect.gen(function* () {
      const r = yield* withResult(ctx.scope("project").state.settings);
      if (r._tag !== "Success") {
        throw new Error(`baseline settings expected to succeed, got ${r._tag}`);
      }
      return r.success;
    }),
  );

const readBaselineLockfile = () =>
  runScenario(validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME), (ctx) =>
    Effect.gen(function* () {
      const r = yield* withResult(ctx.scope("project").state.lockfile);
      if (r._tag !== "Success") {
        throw new Error(`baseline lockfile expected to succeed, got ${r._tag}`);
      }
      return r.success;
    }),
  );

describe("source independence", () => {
  it.effect("corrupt lockfile leaves settings unchanged (bit-identical to baseline)", () =>
    Effect.gen(function* () {
      const baseline = yield* readBaselineSettings();
      const observed = yield* runScenario(
        lockfileInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME),
        (ctx) =>
          Effect.gen(function* () {
            const r = yield* withResult(ctx.scope("project").state.settings);
            if (r._tag !== "Success") {
              throw new Error("settings should not fail when only lockfile is corrupt");
            }
            return r.success;
          }),
      );
      // Both should be `Some` and structurally equal.
      expect(Option.isSome(observed)).toBe(true);
      expect(Option.isSome(baseline)).toBe(true);
      if (Option.isSome(observed) && Option.isSome(baseline)) {
        expect(observed.value).toEqual(baseline.value);
      }
    }),
  );

  it.effect("corrupt settings leaves lockfile unchanged (bit-identical to baseline)", () =>
    Effect.gen(function* () {
      const baseline = yield* readBaselineLockfile();
      const observed = yield* runScenario(
        settingsInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME),
        (ctx) =>
          Effect.gen(function* () {
            const r = yield* withResult(ctx.scope("project").state.lockfile);
            if (r._tag !== "Success") {
              throw new Error("lockfile should not fail when only settings are corrupt");
            }
            return r.success;
          }),
      );
      expect(Option.isSome(observed)).toBe(true);
      expect(Option.isSome(baseline)).toBe(true);
      if (Option.isSome(observed) && Option.isSome(baseline)) {
        expect(observed.value).toEqual(baseline.value);
      }
    }),
  );

  it.effect("corrupt lockfile leaves actual scanner output unaffected", () =>
    Effect.gen(function* () {
      // Baseline: skills.actual on validAll has no agent dirs / canonical
      // skills, so the actual array is empty. Verify that's still true on a
      // lockfile-corrupt fixture.
      const baselineActual = yield* runScenario(
        validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME),
        (ctx) => ctx.scope("project").skills.actual,
      );
      const observedActual = yield* runScenario(
        lockfileInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME),
        (ctx) => ctx.scope("project").skills.actual,
      );
      expect(observedActual).toEqual(baselineActual);
    }),
  );

  it.effect("corrupt settings leaves actual scanner output unaffected", () =>
    Effect.gen(function* () {
      const baselineActual = yield* runScenario(
        validAll(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME),
        (ctx) => ctx.scope("project").skills.actual,
      );
      const observedActual = yield* runScenario(
        settingsInvalidOnly(SCENARIO_WORKSPACE_ROOT, SCENARIO_USER_HOME),
        (ctx) => ctx.scope("project").skills.actual,
      );
      expect(observedActual).toEqual(baselineActual);
    }),
  );
});
