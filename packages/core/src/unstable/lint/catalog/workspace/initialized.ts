/**
 * `workspace/initialized` — `.axm/` and `.axm/settings.json` both exist.
 *
 * Per `docs/design/lint-engine.md §10.workspace` "Foundation" row:
 *
 *   Workspace bootstrap invariant. Absorbs doctor `workspace-ready.*` checks.
 *
 * Applies to every workspace context (both scopes). Owns the presence arm;
 * `workspace/settings-schema-valid` owns the contents arm and early-returns
 * when `settings.json` is missing, so a fresh workspace surfaces exactly one
 * finding from this rule.
 *
 * Advisory-only — scaffolding a workspace is a multi-step `axm init` command;
 * keeping it a suggestion scopes autofix to Operation-expressible mutations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/initialized";
const AXM_DIR = ".axm";
const SETTINGS_REL = ".axm/settings.json";

export const initializedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Workspace is initialized (.axm directory and settings.json present).",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const [axmExists, settingsExists] = yield* Effect.all(
        [context.workspace.exists(AXM_DIR), context.workspace.exists(SETTINGS_REL)],
        { concurrency: "unbounded" },
      );
      const findings: Array<AdvisoryFinding> = [];
      if (!axmExists) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: "Workspace is not initialized; .axm directory is missing.",
          suggestions: ["Run `axm init` to scaffold the workspace."],
          location: { file: AXM_DIR },
        });
        return findings;
      }
      if (!settingsExists) {
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: "Workspace is missing .axm/settings.json.",
          suggestions: ["Run `axm init` to scaffold settings.json."],
          location: { file: SETTINGS_REL },
        });
      }
      return findings;
    }),
};
