/**
 * Unit tests for lint rule and finding primitives.
 *
 * Covers the spec scenarios for the "Lint primitives expose discriminated rule
 * and finding unions" requirement:
 *
 * - `AutofixingRule` forces a `fix` method to exist at the type level.
 * - `AutofixableFinding.suggestions` has exactly one entry.
 * - `AdvisoryFinding.suggestions` admits zero or more entries.
 * - Narrowing via the `kind` discriminant works without non-null assertions or
 *   type assertions.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { Operation } from "../plan/plan.js";
import type {
  AdvisoryFinding,
  AdvisoryRule,
  AutofixableFinding,
  AutofixingRule,
  FindingLocation,
  LintFinding,
  LintRule,
  Severity,
} from "./rule.js";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

interface FakeContext {
  readonly label: string;
}

const advisoryFinding = (overrides: Partial<AdvisoryFinding> = {}): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: "skill/frontmatter-parseable",
  severity: "error",
  message: "frontmatter must begin at byte 0; found leading HTML comment.",
  suggestions: ["Strip leading bytes before the first `---`"],
  ...overrides,
});

const autofixableFinding = (overrides: Partial<AutofixableFinding> = {}): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: "workspace/skills-artifacts-correct",
  severity: "error",
  message: "skill enabled but not linked for agent.",
  suggestions: ["Link skill artifact for agent"],
  ...overrides,
});

const advisoryRule: AdvisoryRule<FakeContext> = {
  id: "skill/skill-md-present",
  description: "Skill has a SKILL.md file.",
  kind: "advisory",
  severity: "error",
  check: () => Effect.succeed([]),
};

const autofixingRule: AutofixingRule<FakeContext> = {
  id: "workspace/skills-artifacts-correct",
  description: "Enabled skills are linked for every declared agent.",
  kind: "autofixing",
  severity: "error",
  check: () => Effect.succeed([]),
  fix: (): Effect.Effect<ReadonlyArray<Operation<string, unknown>>> => Effect.succeed([]),
};

// -----------------------------------------------------------------------------
// Finding shape
// -----------------------------------------------------------------------------

describe("LintFinding discriminated union", () => {
  it("AutofixableFinding.suggestions tuple has exactly one entry", () => {
    const finding = autofixableFinding();

    expect(finding.suggestions).toHaveLength(1);
    expect(finding.suggestions[0]).toBe("Link skill artifact for agent");
  });

  it("AdvisoryFinding.suggestions admits zero entries", () => {
    const finding = advisoryFinding({ suggestions: [] });

    expect(finding.suggestions).toHaveLength(0);
  });

  it("AdvisoryFinding.suggestions admits multiple entries", () => {
    const finding = advisoryFinding({
      suggestions: ["Strip leading bytes", "Fix YAML syntax"],
    });

    expect(finding.suggestions).toHaveLength(2);
  });

  it("narrows LintFinding on kind without type assertions", () => {
    const findings: ReadonlyArray<LintFinding> = [advisoryFinding(), autofixableFinding()];

    const advisoryOnly = findings.filter(
      (finding): finding is AdvisoryFinding => finding.kind === "advisory",
    );
    const autofixableOnly = findings.filter(
      (finding): finding is AutofixableFinding => finding.kind === "autofixable",
    );

    expect(advisoryOnly).toHaveLength(1);
    expect(autofixableOnly).toHaveLength(1);
    expect(autofixableOnly[0]?.suggestions).toHaveLength(1);
  });

  it("FindingLocation carries accessor-relative posix file and optional coordinates", () => {
    const location: FindingLocation = {
      file: "SKILL.md",
      line: 1,
      column: 1,
    };

    expect(location.file).toBe("SKILL.md");
    expect(location.line).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// Rule shape
// -----------------------------------------------------------------------------

describe("LintRule discriminated union", () => {
  it("AdvisoryRule check returns Effect of AdvisoryFinding array", () =>
    Effect.gen(function* () {
      const findings = yield* advisoryRule.check({ label: "ctx" });

      expect(findings).toEqual([]);
    }).pipe(Effect.runPromise));

  it("AutofixingRule carries both check and fix at the type level", () => {
    // The presence of `fix` on `AutofixingRule` is enforced by the type system;
    // this assertion exercises the narrowing required by consumers.
    const rule: LintRule<FakeContext> = autofixingRule;

    if (rule.kind === "autofixing") {
      expect(typeof rule.fix).toBe("function");
    } else {
      throw new Error("expected autofixing rule");
    }
  });

  it("AdvisoryRule does not expose a fix method", () => {
    const rule: LintRule<FakeContext> = advisoryRule;

    if (rule.kind === "advisory") {
      // `fix` is absent from AdvisoryRule by construction.
      expect("fix" in rule).toBe(false);
    } else {
      throw new Error("expected advisory rule");
    }
  });

  it("LintRule narrows on kind without non-null assertions", () => {
    const rules: ReadonlyArray<LintRule<FakeContext>> = [advisoryRule, autofixingRule];
    const autofixing = rules.filter(
      (rule): rule is AutofixingRule<FakeContext> => rule.kind === "autofixing",
    );

    expect(autofixing).toHaveLength(1);
    expect(autofixing[0]?.id).toBe("workspace/skills-artifacts-correct");
  });

  it("rule severity is one of error | warning | info", () => {
    const severities: ReadonlyArray<Severity> = ["error", "warning", "info"];

    expect(severities).toContain(advisoryRule.severity);
    expect(severities).toContain(autofixingRule.severity);
  });
});
