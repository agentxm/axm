/**
 * `workspace/lockfile-valid` — `.axm/axm-lock.yaml` parses and conforms to
 * `LockfileSchema`.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace`:
 *
 * 1. `.axm/axm-lock.yaml` exists when settings declares any extension
 *    (skills, packs, commands, subagents, mcps). **Missing arm is
 *    autofixing** — `fix` returns `install-{type}` Operations for every
 *    declared extension; each handler writes its lockfile entry as a side
 *    effect, recreating the lockfile.
 * 2. Lockfile bytes parse as YAML (the accessor surfaces parse failures via
 *    `LockfileReadError`; we emit one advisory finding per read failure).
 * 3. `Schema.decodeUnknownResult(LockfileSchema)` succeeds; `ParseResult`
 *    issues map 1:1 to advisory findings via `schemaDecodeFindings`.
 *
 * Arms 2 and 3 are advisory (no autofix) because repairing them requires
 * editing a file that axm does not own through the per-extension Operation
 * vocabulary. Arm 1 is autofixing because every install handler writes a
 * fresh lockfile entry as a side effect, and chained install-Operations
 * recreate the file deterministically.
 *
 * Early-return: workspaces with no declared extensions (no skills, no
 * packs, no commands, no subagents, no mcps) don't require a
 * lockfile — this rule emits zero findings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type {
  AdvisoryFinding,
  AutofixableFinding,
  AutofixingRule,
  LintFinding,
} from "../../rule.js";
import { type Settings } from "../../../settings/schema.js";
import { collectMissingLockfileInstallOps } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/lockfile-valid";
const LOCKFILE_REL = ".axm/axm-lock.yaml";
const SETTINGS_REL = ".axm/settings.json";

const hasAnyDeclaration = (settings: Settings): boolean => {
  const skills = Object.keys(settings.skills ?? {}).length;
  const packs = Object.keys(settings.packs ?? {}).length;
  const commands = Object.keys(settings.commands ?? {}).length;
  const subagents = Object.keys(settings.subagents ?? {}).length;
  const mcpServers = Object.keys(settings.mcpServers ?? {}).length;
  return skills + packs + commands + subagents + mcpServers > 0;
};

const makeMissingFinding = (): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    "The lockfile is missing even though workspace settings declare installed extensions. Run `axm lint --fix` to reinstall the declared extensions and regenerate it.",
  location: { file: LOCKFILE_REL },
});

export const lockfileValidRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "The lockfile exists when declarations require it and stays structurally valid.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      // Cascade arm 1: lockfile presence when declarations exist.
      const settingsResult = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      if (Option.isNone(settingsResult.success)) {
        // workspace/settings-schema-valid owns the decode arm; nothing to
        // do here until settings decode.
        return EMPTY_LINT_FINDINGS;
      }
      const declared = hasAnyDeclaration(settingsResult.success.value);

      const lockfileResult = yield* Effect.result(scoped.state.lockfile);
      if (Result.isFailure(lockfileResult)) {
        if (lockfileResult.failure._tag === "LockfileDecodeError") {
          return lockfileResult.failure.issues.map(
            (issue): AdvisoryFinding => ({
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "error",
              message: `The lockfile does not match the expected schema. Detail: ${issue}. Regenerate \`${LOCKFILE_REL}\` from \`${SETTINGS_REL}\` by reinstalling the declared extensions.`,
              location: { file: LOCKFILE_REL },
            }),
          );
        }
        // Read failure surfaces as advisory finding naming the IO problem.
        const advisory: AdvisoryFinding = {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            `The lockfile is not valid YAML. Detail: ${lockfileResult.failure._tag}. ` +
            `Regenerate \`${LOCKFILE_REL}\` from \`${SETTINGS_REL}\` by reinstalling the declared extensions.`,
          location: { file: LOCKFILE_REL },
        };
        const readFailure: ReadonlyArray<LintFinding> = [advisory];
        return readFailure;
      }

      const option = lockfileResult.success;
      if (Option.isNone(option)) {
        if (!declared) {
          return EMPTY_LINT_FINDINGS;
        }
        return [makeMissingFinding()];
      }

      return EMPTY_LINT_FINDINGS;
    }),
  fix: (context, _finding) =>
    Effect.gen(function* () {
      const scoped = context.workspace;
      const settingsResult = yield* Effect.result(scoped.state.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_OPERATIONS;
      }
      if (Option.isNone(settingsResult.success)) {
        return EMPTY_OPERATIONS;
      }
      return collectMissingLockfileInstallOps(settingsResult.success.value);
    }),
};
