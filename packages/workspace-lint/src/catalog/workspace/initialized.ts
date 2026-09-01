/**
 * `workspace/initialized` — the scope's settings authority exists.
 *
 * Per the lint design "Foundation" row:
 *
 *   WorkspaceMutations bootstrap invariant. Absorbs doctor `workspace-ready.*` checks.
 *
 * Applies to every workspace read model (both scopes). Owns the presence arm;
 * `workspace/settings-schema-valid` owns the contents arm and early-returns
 * when `axm.json` is missing, so a fresh workspace surfaces exactly one
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
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
import { settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/initialized";
const AXM_REL = ".axm";

export const initializedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The workspace includes its scope-specific settings authority.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsPath = settingsDisplayPath(context.subject.scope);
      const settingsRaw = yield* Effect.result(scoped.state.raw("settings"));
      const axmDirExists = yield* context.axmDirExists;
      const findings: Array<AdvisoryFinding> = [];
      if (Result.isFailure(settingsRaw) || Option.isNone(settingsRaw.success)) {
        if (context.subject.scope === "user" && !axmDirExists) {
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: "The workspace does not contain an `.axm/` state directory.",
            location: { file: AXM_REL },
          });
          return findings;
        }
        findings.push({
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: "The workspace settings file is missing.",
          location: { file: settingsPath },
        });
      }
      return findings;
    }),
};
