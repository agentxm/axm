/**
 * `workspace/lockfile-valid` — `.axm/axm-lock.yaml` parses and conforms to
 * `LockfileSchema`.
 *
 * Cascade per `docs/design/lint-engine.md §10.workspace`:
 *
 * 1. `.axm/axm-lock.yaml` exists when settings declares any extension
 *    (skills, packs, commands, subagents, mcp-servers). **Missing arm is
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
 * packs, no commands, no subagents, no mcp-servers) don't require a
 * lockfile — this rule emits zero findings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { WorkspaceRuleContext } from "../../context.js";
import type {
  AdvisoryFinding,
  AutofixableFinding,
  AutofixingRule,
  LintFinding,
} from "../../rule.js";
import { LockfileSchema } from "../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../settings/schema.js";
import { schemaDecodeFindings } from "../shared/schema-rule.js";
import { collectMissingLockfileInstallOps } from "./helpers/install-ops.js";
import { EMPTY_LINT_FINDINGS, EMPTY_OPERATIONS } from "./helpers/empty.js";

const RULE_ID = "workspace/lockfile-valid";
const LOCKFILE_REL = ".axm/axm-lock.yaml";

const MISSING_LOCKFILE_MISSING_SUGGESTION =
  "Reinstall every declared extension to rewrite the lockfile.";

const hasAnyDeclaration = (settings: Settings): boolean => {
  const skills = Object.keys(settings.skills ?? {}).length;
  const packs = Object.keys(settings.packs ?? {}).length;
  const commands = Object.keys(settings.commands ?? {}).length;
  const subagents = Object.keys(settings.subagents ?? {}).length;
  const mcpServers = Object.keys(settings.mcpServers ?? {}).length;
  return skills + packs + commands + subagents + mcpServers > 0;
};

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

const makeMissingFinding = (): AutofixableFinding => ({
  kind: "autofixable",
  ruleId: RULE_ID,
  severity: "error",
  message:
    "Lockfile is missing while settings declare installed extensions; reinstall to regenerate it.",
  suggestions: [MISSING_LOCKFILE_MISSING_SUGGESTION],
  location: { file: LOCKFILE_REL },
});

export const lockfileValidRule: AutofixingRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "axm-lock.yaml is present and conforms to LockfileSchema.",
  kind: "autofixing",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      // Cascade arm 1: lockfile presence when declarations exist.
      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_LINT_FINDINGS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        // workspace/settings-schema-valid owns the decode arm; nothing to
        // do here until settings decode.
        return EMPTY_LINT_FINDINGS;
      }
      const declared = hasAnyDeclaration(settings.value);

      const lockfileResult = yield* Effect.result(context.workspace.lockfile);
      if (Result.isFailure(lockfileResult)) {
        // Read failure surfaces as advisory finding naming the IO problem.
        const advisory: AdvisoryFinding = {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message: `Could not read axm-lock.yaml: ${lockfileResult.failure.message}`,
          suggestions: ["Fix YAML syntax at the referenced location."],
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

      // Cascade arm 3: schema decode of the parsed YAML.
      const decodedFindings = yield* schemaDecodeFindings(
        RULE_ID,
        "error",
        LOCKFILE_REL,
        LockfileSchema,
        option.value,
      );
      return decodedFindings;
    }),
  fix: (context, finding) =>
    Effect.gen(function* () {
      // Autofix only applies to the missing arm; the advisory arms above
      // never produce `AutofixableFinding`s.
      if (finding.suggestions[0] !== MISSING_LOCKFILE_MISSING_SUGGESTION) {
        return EMPTY_OPERATIONS;
      }

      const settingsResult = yield* Effect.result(context.workspace.settings);
      if (Result.isFailure(settingsResult)) {
        return EMPTY_OPERATIONS;
      }
      const settings = decodeSettings(settingsResult.success);
      if (Option.isNone(settings)) {
        return EMPTY_OPERATIONS;
      }
      return collectMissingLockfileInstallOps(settings.value);
    }),
};
