/**
 * Scenario-test harness for the workspace read-model capability.
 *
 * Each scenario file under `__tests__/scenarios/` consumes this harness:
 *
 * - `runScenario(spec, body)` builds both scopes via
 *   {@link makeWorkspaceReadModel} against the in-memory fixture FS, exposes
 *   them through a thin `ctx.scope(scope)` selector so scenarios can yield
 *   from either scope, and runs `body` with the result.
 * - `expectFirst(arr)` asserts the array is non-empty and returns its first
 *   element, replacing the silent `if (entry === undefined) return` pattern.
 * - `expectDiagnostics(ctx, scope, predicate)` reads the scoped diagnostics
 *   buffer once and asserts at least one warning matches `predicate`.
 * - `tagsOf(cause)` extracts the tagged-error `_tag` set from an `Effect.Cause`
 *   so the ≤3-tag assertion in 10.2 stays compact.
 *
 * The harness is a leading-underscore module so vitest does not pick it up as
 * a test file.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceReadModelTestOptions } from "./test-layer.js";
import { WorkspaceReadModelTest } from "./test-layer.js";
import type { FixtureSpec, PathEscapeError } from "./builder.js";
import type { Warning } from "../diagnostics.js";
import type { WorkspaceRootEscape } from "../errors.js";
import { makeWorkspaceReadModel, type WorkspaceReadModel } from "../service.js";
import type { Scope } from "../types.js";

/**
 * Scenario-side wrapper exposing both scopes through a `scope(scope)`
 * selector. Both scopes are pre-built via {@link makeWorkspaceReadModel} so
 * scenarios can yield from either scope freely. The selector returns a
 * memoized {@link WorkspaceReadModel} per scope.
 */
export interface WorkspaceReadModelScenarioCtx {
  readonly scope: (scope: Scope) => WorkspaceReadModel;
}

/**
 * Default workspace and user-home roots used by scenario specs. Tests may
 * override per-spec by passing different values when constructing a
 * `FixtureSpec`.
 */
export const SCENARIO_WORKSPACE_ROOT = "/scenario/workspace";
export const SCENARIO_USER_HOME = "/scenario/home";

/**
 * Build per-scope read models against the supplied fixture spec, provide them
 * to `body`, and run the resulting effect. Both scopes are constructed
 * eagerly so the body can yield from either scope without re-running the
 * factory.
 *
 * The body's `E` channel is preserved through to the harness's return type
 * so scenario tests can `yield*` source-backed cells (which fail with
 * `SettingsReadError` / `LockfileReadError`) directly without wrapping every
 * call site in `Effect.result`.
 */
export const runScenario = <A, E = never>(
  spec: FixtureSpec,
  body: (ctx: WorkspaceReadModelScenarioCtx) => Effect.Effect<A, E>,
  options?: WorkspaceReadModelTestOptions,
): Effect.Effect<A, E | WorkspaceRootEscape | PathEscapeError> =>
  Effect.gen(function* () {
    const project = yield* makeWorkspaceReadModel("project");
    const user = yield* makeWorkspaceReadModel("user");
    const ctx: WorkspaceReadModelScenarioCtx = {
      scope: (scope) => (scope === "project" ? project : user),
    };
    return yield* body(ctx);
  }).pipe(Effect.provide(WorkspaceReadModelTest(spec, options)));

/**
 * Assert that `arr` is non-empty and return its first element. Replaces the
 * silent `if (entry === undefined) return` pattern that lets a misshapen
 * array silently pass a test.
 */
export const expectFirst = <T>(arr: ReadonlyArray<T>, message?: string): T => {
  const value = arr[0];
  if (value === undefined) {
    throw new Error(message ?? "expectFirst: array is empty");
  }
  return value;
};

/**
 * Assert that `option` is `Option.Some` and return its inner value. Replaces
 * the `expect(Option.isSome(opt)).toBe(true); if (!Option.isSome(opt)) return;`
 * pattern that loses the failure message and lets misshapen values silently
 * pass a test.
 */
export const expectSome = <T>(option: Option.Option<T>, message?: string): T => {
  if (!Option.isSome(option)) {
    throw new Error(message ?? "expectSome: option is None");
  }
  return option.value;
};

/**
 * Assert that `result` is a `Result.Success` and return its success value.
 * Replaces `expect(result._tag).toBe("Success"); if (result._tag === ...)`
 * narrowing chains.
 */
export const expectSuccess = <A, E>(result: Result.Result<A, E>, message?: string): A => {
  if (!Result.isSuccess(result)) {
    throw new Error(message ?? `expectSuccess: result is Failure`);
  }
  return result.success;
};

/**
 * Assert that `result` is a `Result.Failure` and return its failure value.
 * Replaces `expect(result._tag).toBe("Failure"); if (result._tag === ...)`
 * narrowing chains.
 */
export const expectFailure = <A, E>(result: Result.Result<A, E>, message?: string): E => {
  if (!Result.isFailure(result)) {
    throw new Error(message ?? `expectFailure: result is Success`);
  }
  return result.failure;
};

const hasStringTag = (value: unknown): value is { readonly _tag: string } => {
  if (typeof value !== "object" || value === null) return false;
  if (!("_tag" in value)) return false;
  // After the `in` narrowing, `value._tag` exists with type `unknown`.
  // Compare its dynamic type without an assertion.
  const tagValue: unknown = value._tag;
  return typeof tagValue === "string";
};

/**
 * Extract the set of tagged-error `_tag` values reachable inside a `Cause`.
 * Used for the ≤3-tag-per-cell quality constraint assertion.
 */
export const tagsOf = <E>(cause: Cause.Cause<E>): ReadonlySet<string> => {
  const tags = new Set<string>();
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    const candidate: unknown = reason.error;
    if (hasStringTag(candidate)) {
      tags.add(candidate._tag);
    }
  }
  return tags;
};

/**
 * Read the scoped diagnostics buffer once and assert at least one warning
 * matches `predicate`. Returns the matching warnings so callers can chain
 * additional assertions.
 */
export const expectDiagnostics = (
  ctx: WorkspaceReadModelScenarioCtx,
  scope: Scope,
  predicate: (warning: Warning) => boolean,
): Effect.Effect<ReadonlyArray<Warning>> =>
  Effect.gen(function* () {
    const warnings = yield* ctx.scope(scope).diagnostics;
    const matches = warnings.filter(predicate);
    if (matches.length === 0) {
      throw new Error("expected at least one warning matching predicate");
    }
    return matches;
  });

/**
 * Snapshot the scoped diagnostics buffer without asserting. Useful when a
 * scenario wants to verify the absence of a warning class.
 */
export const readDiagnostics = (
  ctx: WorkspaceReadModelScenarioCtx,
  scope: Scope,
): Effect.Effect<ReadonlyArray<Warning>> => ctx.scope(scope).diagnostics;
