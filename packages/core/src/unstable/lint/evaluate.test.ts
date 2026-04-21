/**
 * Unit tests for `evaluateContexts` and `collectFixOperations`.
 *
 * Covers the spec scenarios for the "Evaluator is a pure caller-invoked
 * function" requirement:
 *
 * - Evaluation pairs rule with context.
 * - Severity overrides apply before emission.
 * - `off` suppresses emission.
 * - `collectFixOperations` dedupes structurally identical Operations.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { Operation } from "../plan/plan.js";
import {
  LintConfigSchema,
  platformCanonicalLintConfig,
  registerLintRuleIds,
  type LintConfig,
} from "./config.js";
import { collectFixOperations, evaluateContexts } from "./evaluate.js";
import type {
  AdvisoryFinding,
  AdvisoryRule,
  AutofixableFinding,
  AutofixingRule,
  LintRule,
} from "./rule.js";
import * as Schema from "effect/Schema";

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

interface FakeContext {
  readonly name: string;
}

const ONE_RULE_ID = "skill/frontmatter-parseable";
const TWO_RULE_ID = "skill/manifest-schema-valid";
const FIX_RULE_ID = "workspace/skills-artifacts-correct";
const DUP_RULE_ID = "workspace/skills-lockfile-aligned";

// Register test rule ids so `LintConfig` decode accepts them.
registerLintRuleIds([ONE_RULE_ID, TWO_RULE_ID, FIX_RULE_ID, DUP_RULE_ID]);

const mkAdvisoryRule = (
  id: string,
  findings: ReadonlyArray<AdvisoryFinding>,
): AdvisoryRule<FakeContext> => ({
  id,
  description: `advisory rule ${id}`,
  kind: "advisory",
  severity: "error",
  check: () => Effect.succeed(findings),
});

const mkAutofixingRule = (
  id: string,
  findings: ReadonlyArray<AutofixableFinding>,
  ops: ReadonlyArray<Operation<string, unknown>>,
): AutofixingRule<FakeContext> => ({
  id,
  description: `autofixing rule ${id}`,
  kind: "autofixing",
  severity: "error",
  check: () => Effect.succeed(findings),
  fix: () => Effect.succeed(ops),
});

const finding = (ruleId: string, overrides: Partial<AdvisoryFinding> = {}): AdvisoryFinding => ({
  kind: "advisory",
  ruleId,
  severity: "error",
  message: `finding from ${ruleId}`,
  suggestions: [],
  ...overrides,
});

const autofix = (ruleId: string): AutofixableFinding => ({
  kind: "autofixable",
  ruleId,
  severity: "error",
  message: `autofix finding from ${ruleId}`,
  suggestions: ["fix it"],
});

const makeOp = (
  name: string,
  args: Readonly<Record<string, unknown>>,
): Operation<string, unknown> => ({
  name,
  args,
});

// -----------------------------------------------------------------------------
// evaluateContexts — pairing
// -----------------------------------------------------------------------------

describe("evaluateContexts", () => {
  it.effect("pairs each rule with each context", () =>
    Effect.gen(function* () {
      const r1 = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID)]);
      const r2 = mkAdvisoryRule(TWO_RULE_ID, [finding(TWO_RULE_ID)]);
      const contexts: ReadonlyArray<FakeContext> = [{ name: "c1" }, { name: "c2" }, { name: "c3" }];

      const evaluated = yield* evaluateContexts([r1, r2], contexts, platformCanonicalLintConfig);

      expect(evaluated).toHaveLength(6);
      const pairs = evaluated.map((entry) => [entry.rule.id, entry.context.name]);
      expect(pairs).toEqual([
        [ONE_RULE_ID, "c1"],
        [ONE_RULE_ID, "c2"],
        [ONE_RULE_ID, "c3"],
        [TWO_RULE_ID, "c1"],
        [TWO_RULE_ID, "c2"],
        [TWO_RULE_ID, "c3"],
      ]);
    }),
  );

  it.effect("applies severity override before emission (error -> warning)", () =>
    Effect.gen(function* () {
      const rule = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID)]);
      const config: LintConfig = { rules: { [ONE_RULE_ID]: "warn" } };

      const evaluated = yield* evaluateContexts([rule], [{ name: "c" }], config);

      expect(evaluated[0]?.findings).toHaveLength(1);
      expect(evaluated[0]?.findings[0]?.severity).toBe("warning");
    }),
  );

  it.effect("applies severity override before emission (error -> info)", () =>
    Effect.gen(function* () {
      const rule = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID)]);
      const config: LintConfig = { rules: { [ONE_RULE_ID]: "info" } };

      const evaluated = yield* evaluateContexts([rule], [{ name: "c" }], config);

      expect(evaluated[0]?.findings[0]?.severity).toBe("info");
    }),
  );

  it.effect("applies severity override before emission (error -> error preserves)", () =>
    Effect.gen(function* () {
      const rule = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID)]);
      const config: LintConfig = { rules: { [ONE_RULE_ID]: "error" } };

      const evaluated = yield* evaluateContexts([rule], [{ name: "c" }], config);

      expect(evaluated[0]?.findings[0]?.severity).toBe("error");
    }),
  );

  it.effect("off override suppresses emission", () =>
    Effect.gen(function* () {
      const rule = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID), finding(ONE_RULE_ID)]);
      const config: LintConfig = { rules: { [ONE_RULE_ID]: "off" } };

      const evaluated = yield* evaluateContexts([rule], [{ name: "c" }], config);

      expect(evaluated[0]?.findings).toEqual([]);
    }),
  );

  it.effect("unconfigured rules retain platform default severity", () =>
    Effect.gen(function* () {
      const rule = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID)]);

      const evaluated = yield* evaluateContexts(
        [rule],
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      expect(evaluated[0]?.findings[0]?.severity).toBe("error");
    }),
  );

  it.effect("pairs an autofixing rule's findings with context for downstream fix", () =>
    Effect.gen(function* () {
      const rule = mkAutofixingRule(
        FIX_RULE_ID,
        [autofix(FIX_RULE_ID)],
        [makeOp("install-skill", { skillName: "example" })],
      );

      const evaluated = yield* evaluateContexts(
        [rule],
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      expect(evaluated[0]?.rule.id).toBe(FIX_RULE_ID);
      expect(evaluated[0]?.context.name).toBe("c");
      expect(evaluated[0]?.findings[0]?.kind).toBe("autofixable");
    }),
  );
});

// -----------------------------------------------------------------------------
// collectFixOperations
// -----------------------------------------------------------------------------

describe("collectFixOperations", () => {
  it.effect("returns an empty array when no findings are autofixable", () =>
    Effect.gen(function* () {
      const rule = mkAdvisoryRule(ONE_RULE_ID, [finding(ONE_RULE_ID)]);
      const evaluated = yield* evaluateContexts(
        [rule],
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      const ops = yield* collectFixOperations(evaluated);

      expect(ops).toEqual([]);
    }),
  );

  it.effect("flattens fix operations across findings", () =>
    Effect.gen(function* () {
      const rule = mkAutofixingRule(
        FIX_RULE_ID,
        [autofix(FIX_RULE_ID), autofix(FIX_RULE_ID)],
        [makeOp("install-skill", { skillName: "a" }), makeOp("enable-skill", { skillName: "a" })],
      );
      const evaluated = yield* evaluateContexts(
        [rule],
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      const ops = yield* collectFixOperations(evaluated);

      // Each finding invokes fix; but the same Operation values should dedupe.
      expect(ops).toHaveLength(2);
      expect(ops.map((op) => op.name).sort()).toEqual(["enable-skill", "install-skill"]);
    }),
  );

  it.effect("dedupes structurally identical Operations across different rules", () =>
    Effect.gen(function* () {
      const ruleA = mkAutofixingRule(
        FIX_RULE_ID,
        [autofix(FIX_RULE_ID)],
        [makeOp("install-skill", { skillName: "shared" })],
      );
      const ruleB = mkAutofixingRule(
        DUP_RULE_ID,
        [autofix(DUP_RULE_ID)],
        [makeOp("install-skill", { skillName: "shared" })],
      );

      const rules: ReadonlyArray<LintRule<FakeContext>> = [ruleA, ruleB];
      const evaluated = yield* evaluateContexts(
        rules,
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      const ops = yield* collectFixOperations(evaluated);

      expect(ops).toHaveLength(1);
      expect(ops[0]?.name).toBe("install-skill");
    }),
  );

  it.effect("dedupe ignores property key ordering in args", () =>
    Effect.gen(function* () {
      const ruleA = mkAutofixingRule(
        FIX_RULE_ID,
        [autofix(FIX_RULE_ID)],
        [makeOp("install-skill", { a: 1, b: 2 })],
      );
      const ruleB = mkAutofixingRule(
        DUP_RULE_ID,
        [autofix(DUP_RULE_ID)],
        [makeOp("install-skill", { b: 2, a: 1 })],
      );

      const rules: ReadonlyArray<LintRule<FakeContext>> = [ruleA, ruleB];
      const evaluated = yield* evaluateContexts(
        rules,
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      const ops = yield* collectFixOperations(evaluated);

      expect(ops).toHaveLength(1);
    }),
  );

  it.effect("distinct Operations with different args are both retained", () =>
    Effect.gen(function* () {
      const rule = mkAutofixingRule(
        FIX_RULE_ID,
        [autofix(FIX_RULE_ID), autofix(FIX_RULE_ID)],
        [makeOp("install-skill", { skillName: "a" }), makeOp("install-skill", { skillName: "b" })],
      );
      const evaluated = yield* evaluateContexts(
        [rule],
        [{ name: "c" }],
        platformCanonicalLintConfig,
      );

      const ops = yield* collectFixOperations(evaluated);

      expect(ops).toHaveLength(2);
      const names = ops.map((op) => (op.args as { readonly skillName: string }).skillName).sort();
      expect(names).toEqual(["a", "b"]);
    }),
  );

  it.effect("skips findings whose severity override is off", () =>
    Effect.gen(function* () {
      const rule = mkAutofixingRule(
        FIX_RULE_ID,
        [autofix(FIX_RULE_ID)],
        [makeOp("install-skill", { skillName: "x" })],
      );
      const config: LintConfig = { rules: { [FIX_RULE_ID]: "off" } };
      const evaluated = yield* evaluateContexts([rule], [{ name: "c" }], config);

      const ops = yield* collectFixOperations(evaluated);

      expect(ops).toEqual([]);
    }),
  );
});

// -----------------------------------------------------------------------------
// LintConfig schema — decode guardrails the evaluator depends on
// -----------------------------------------------------------------------------

describe("LintConfigSchema decode", () => {
  it("decodes a valid rules map", () => {
    const decoded = Schema.decodeUnknownSync(LintConfigSchema)({
      rules: { [ONE_RULE_ID]: "warn" },
    });

    expect(decoded.rules?.[ONE_RULE_ID]).toBe("warn");
  });

  it("rejects wildcard keys", () => {
    expect(() =>
      Schema.decodeUnknownSync(LintConfigSchema)({
        rules: { "skill/*": "warn" },
      }),
    ).toThrow();
  });

  it("rejects unknown rule ids", () => {
    expect(() =>
      Schema.decodeUnknownSync(LintConfigSchema)({
        rules: { "skill/does-not-exist": "warn" },
      }),
    ).toThrow();
  });

  it("accepts each of the four severity values", () => {
    for (const severity of ["off", "info", "warn", "error"] as const) {
      const decoded = Schema.decodeUnknownSync(LintConfigSchema)({
        rules: { [ONE_RULE_ID]: severity },
      });
      expect(decoded.rules?.[ONE_RULE_ID]).toBe(severity);
    }
  });
});
