import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { LintConfig, LintRuleSeverity } from "./config.js";
import type { AdvisoryRule } from "./rule.js";
import { evaluateContexts } from "./evaluate.js";

const rule = (
  severity: "error" | "warning" | "info",
  id = `workspace/${severity}-fact`,
): AdvisoryRule<string> => ({
  id,
  description: `${severity} fact`,
  kind: "advisory",
  severity,
  check: (context) =>
    Effect.succeed(
      ["first", "second"].map((ordinal) => ({
        kind: "advisory" as const,
        ruleId: id,
        severity,
        message: `${context}-${ordinal}`,
      })),
    ),
});

const defaults = ["error", "warning", "info"] as const;
const overrides = [undefined, "off", "info", "warn", "error"] as const;
const matrix = defaults.flatMap((defaultSeverity) =>
  overrides.map((override) => ({
    defaultSeverity,
    configured: override ?? "absent",
    override,
  })),
);

const expectedSeverity = (
  defaultSeverity: (typeof defaults)[number],
  override: LintRuleSeverity | undefined,
) => {
  if (override === undefined) return defaultSeverity;
  if (override === "warn") return "warning";
  return override;
};

describe("evaluateContexts", () => {
  it.effect.each(matrix)(
    "resolves a $defaultSeverity default with $configured configuration",
    ({ defaultSeverity, override }) =>
      Effect.gen(function* () {
        const id = `workspace/${defaultSeverity}-fact`;
        const config: LintConfig = override === undefined ? {} : { rules: { [id]: override } };
        const [evaluated] = yield* evaluateContexts([rule(defaultSeverity)], ["observed"], config);
        const expected = expectedSeverity(defaultSeverity, override);

        if (expected === "off") {
          expect(evaluated?.findings).toEqual([]);
          return;
        }
        expect(evaluated?.findings).toHaveLength(2);
        expect(evaluated?.findings.map(({ severity }) => severity)).toEqual([expected, expected]);
      }),
  );

  it.effect("applies exact rule overrides without depending on the rule namespace", () =>
    Effect.gen(function* () {
      const id = "skill/manifest-schema-valid";
      const [evaluated] = yield* evaluateContexts([rule("error", id)], ["observed"], {
        rules: { [id]: "info" },
      });

      expect(evaluated?.findings).toEqual([
        { kind: "advisory", ruleId: id, severity: "info", message: "observed-first" },
        { kind: "advisory", ruleId: id, severity: "info", message: "observed-second" },
      ]);
    }),
  );
});
