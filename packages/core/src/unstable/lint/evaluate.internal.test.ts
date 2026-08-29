import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { AdvisoryRule } from "./rule.js";
import { evaluateContexts } from "./evaluate.js";

const rule = (severity: "error" | "warning" | "info"): AdvisoryRule<string> => ({
  id: `workspace/${severity}-fact`,
  description: `${severity} fact`,
  kind: "advisory",
  severity,
  check: (context) =>
    Effect.succeed([
      {
        kind: "advisory",
        ruleId: `workspace/${severity}-fact`,
        severity,
        message: context,
      },
    ]),
});

describe("evaluateContexts", () => {
  it.effect("keeps platform errors at error when configuration attempts to lower them", () =>
    Effect.gen(function* () {
      for (const override of ["off", "info", "warn"] as const) {
        const [evaluated] = yield* evaluateContexts([rule("error")], ["observed"], {
          rules: { "workspace/error-fact": override },
        });
        expect(evaluated?.findings[0]?.severity).toBe("error");
      }
    }),
  );

  it.effect("allows warnings to be disabled, retained, or promoted", () =>
    Effect.gen(function* () {
      const off = yield* evaluateContexts([rule("warning")], ["observed"], {
        rules: { "workspace/warning-fact": "off" },
      });
      const retained = yield* evaluateContexts([rule("warning")], ["observed"], {
        rules: { "workspace/warning-fact": "warn" },
      });
      const promoted = yield* evaluateContexts([rule("warning")], ["observed"], {
        rules: { "workspace/warning-fact": "error" },
      });
      expect(off[0]?.findings).toEqual([]);
      expect(retained[0]?.findings[0]?.severity).toBe("warning");
      expect(promoted[0]?.findings[0]?.severity).toBe("error");
    }),
  );
});
