/**
 * Deprecated compatibility rule for the former synthetic-universal-agent
 * invariant.
 *
 * Explicit per-agent skill targeting makes the old invariant invalid. The
 * rule ID remains registered through the current major so existing
 * `lint.rules` configuration continues to decode, but it intentionally emits
 * no findings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AutofixingRule } from "../../rule.js";
import { EMPTY_OPERATIONS } from "./helpers/empty.js";

export const skillsUniversalArtifactPresentRule: AutofixingRule<WorkspaceRuleContext> = {
  id: "workspace/skills-universal-artifact-present",
  description: "Deprecated compatibility rule for universal skill targets.",
  kind: "autofixing",
  severity: "error",
  check: () => Effect.succeed([]),
  fix: () => Effect.succeed(EMPTY_OPERATIONS),
};
