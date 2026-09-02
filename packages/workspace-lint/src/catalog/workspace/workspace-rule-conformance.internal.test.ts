import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { foundationConformanceCases } from "./conformance/foundation/test-helpers.js";
import { instructionConformanceCases } from "./conformance/instructions/test-helpers.js";
import {
  completeWorkspaceFindings,
  type WorkspaceRuleConformanceCase,
} from "./conformance/test-helpers.js";

const cases: ReadonlyArray<WorkspaceRuleConformanceCase> = [
  ...foundationConformanceCases,
  ...instructionConformanceCases,
];

for (const testCase of cases) {
  describe(testCase.rule.id, () => {
    it.effect("has satisfied evidence", () =>
      Effect.gen(function* () {
        const context = yield* testCase.satisfied();
        expect(yield* testCase.rule.check(context)).toEqual([]);
      }),
    );

    it.effect("reports its exact violated evidence", () =>
      Effect.gen(function* () {
        const context = yield* testCase.violated();
        expect(yield* testCase.rule.check(context)).toEqual(completeWorkspaceFindings(testCase));
      }),
    );

    const inapplicable = testCase.inapplicable;
    if (inapplicable !== undefined) {
      it.effect("does not report when inapplicable", () =>
        Effect.gen(function* () {
          const context = yield* inapplicable();
          expect(yield* testCase.rule.check(context)).toEqual([]);
        }),
      );
    }
  });
}
