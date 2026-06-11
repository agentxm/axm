import * as Effect from "effect/Effect";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

interface ManifestPresentRuleInput<C> {
  readonly id: string;
  readonly description: string;
  readonly manifestFile: string;
  readonly message: string;
  readonly exists: (context: C, manifestFile: string) => Effect.Effect<boolean>;
  readonly shouldCheck?: (context: C) => boolean;
}

export const makeManifestPresentRule = <C>({
  id,
  description,
  manifestFile,
  message,
  exists,
  shouldCheck = () => true,
}: ManifestPresentRuleInput<C>): AdvisoryRule<C> => ({
  id,
  description,
  kind: "advisory",
  severity: "error",
  check: (context) => {
    if (!shouldCheck(context)) {
      return Effect.succeed([]);
    }
    return Effect.map(exists(context, manifestFile), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: id,
          severity: "error",
          message,
          location: { file: manifestFile },
        },
      ];
    });
  },
});
