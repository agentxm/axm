/**
 * `workspace/initialized` — `.axm/` and `.axm/settings.json` both exist.
 *
 * Per `docs/design/lint-engine.md §10.workspace` "Foundation" row:
 *
 *   WorkspaceMutations bootstrap invariant. Absorbs doctor `workspace-ready.*` checks.
 *
 * Applies to every workspace read model (both scopes). Owns the presence arm;
 * `workspace/settings-schema-valid` owns the contents arm and early-returns
 * when `settings.json` is missing, so a fresh workspace surfaces exactly one
 * finding from this rule.
 *
 * Advisory-only — scaffolding a workspace is a multi-step `axm setup` command;
 * keeping it a suggestion scopes autofix to Operation-expressible mutations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/initialized";
const AXM_REL = ".axm";
const SETTINGS_REL = ".axm/settings.json";

export const initializedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The workspace includes `.axm/` and `.axm/settings.json`.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace.scope(context.subject.scope);
      const settingsRaw = yield* Effect.result(scoped.state.raw("settings"));
      const axmDirExists = yield* context.axmDirExists;
      const findings: Array<AdvisoryFinding> = [];
      if (Result.isFailure(settingsRaw) || Option.isNone(settingsRaw.success)) {
        if (!axmDirExists) {
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: "The workspace is not initialized. Run `axm setup` to create `.axm/`.",
            location: { file: AXM_REL },
          });
          return findings;
        }
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "The workspace settings file is missing. Run `axm setup` to create `.axm/settings.json`.",
          location: { file: SETTINGS_REL },
        });
      }
      return findings;
    }),
};
