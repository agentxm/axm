/**
 * Rule subject: the canonical subject over `settings.rules`, `axm.lock`
 * `rules` and the canonical-extensions scanner (`type === "rule"`), which
 * enumerates project-authored `rules/<name>/src`, project-acquired
 * `agent_extensions/<family>/<owner>/rules/<name>`, and user-scope packages.
 *
 * Rule projections into native agent files are renderings of an installed
 * rule, not separate materializations, so they are deliberately NOT
 * occurrences and never produce an unmanaged row.
 */

import type * as Effect from "effect/Effect";
import {
  canonicalActuals,
  makeCanonicalSubjectApi,
  type ActualExtension,
  type CanonicalSubjectApi,
  type CanonicalSubjectDeps,
  type InstalledExtension,
} from "./canonical-subject.js";

export type ActualRule = ActualExtension<"rule">;
export type InstalledRule = InstalledExtension<"rule", ActualRule>;
export type RuleExtensionsApi = CanonicalSubjectApi<"rule", ActualRule>;

export const makeRuleExtensionsApi = ({
  scope,
  loaders,
  scanners,
}: CanonicalSubjectDeps): Effect.Effect<RuleExtensionsApi> =>
  makeCanonicalSubjectApi("rule", {
    scope,
    loaders,
    actual: canonicalActuals("rule", scope, scanners.canonical),
  });
