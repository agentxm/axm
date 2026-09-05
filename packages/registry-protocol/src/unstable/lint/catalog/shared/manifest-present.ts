/**
 * Shared factory for `manifest-present` advisory rules.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { AdvisoryFinding, AdvisoryRule, Severity } from "../../rule.js";

interface ManifestFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
}

interface ManifestPresentRuleContext {
  readonly files: ManifestFileAccessor;
}

interface ManifestPresentRuleArgs<C> {
  readonly ruleId: string;
  readonly description: string;
  readonly manifestFile: string;
  readonly missingMessage: string;
  readonly severity?: Severity;
  readonly getFiles?: (context: C) => ManifestFileAccessor;
  readonly applies?: (context: C) => boolean;
}

export const makeManifestPresentRule = <C extends ManifestPresentRuleContext>(
  args: ManifestPresentRuleArgs<C>,
): AdvisoryRule<C> => {
  const severity = args.severity ?? "error";
  const getFiles = args.getFiles ?? ((context: C) => context.files);
  const applies = args.applies ?? (() => true);

  return {
    id: args.ruleId,
    description: args.description,
    kind: "advisory",
    severity,
    check: (context) => {
      if (!applies(context)) {
        return Effect.succeed([]);
      }
      return Effect.map(
        getFiles(context).exists(args.manifestFile),
        (present): ReadonlyArray<AdvisoryFinding> => {
          if (present) {
            return [];
          }
          return [
            {
              kind: "advisory",
              ruleId: args.ruleId,
              severity,
              message: args.missingMessage,
              location: { file: args.manifestFile },
            },
          ];
        },
      );
    },
  };
};
