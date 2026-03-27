/**
 * Enable command handler - Effect-based orchestration for `axm skills enable`.
 *
 * Validates skill state using taxonomy lifecycle views then builds and resolves
 * a single-step plan. Enable only works for installed skills (configured or implicit).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Argument, Command } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { EnableSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import { enableSkill } from "@axm.sh/core/unstable/extension-managers";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags.js";
import { buildSingleStepPlan } from "./plan-helpers.js";
import { bridgeLegacyPlan } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EnableHandlerArgs {
  /** Name of the skill to enable */
  readonly name: string;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handleEnable = Effect.fn("Enable.handle")(function* (args: EnableHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm skills enable");

  // Load installed skills (configured ∪ implicit) — taxonomy lifecycle view
  const installedSkills = yield* ws.getInstalledSkills();
  const entry = installedSkills[args.name];

  // Validate: skill is installed (ignored names are excluded from installed)
  if (entry === undefined) {
    return yield* makeAppError({
      code: "SKILL_NOT_FOUND",
      what: `Skill '${args.name}' is not installed`,
      howToFix: "Run `axm skills list` to see available skills",
    });
  }

  // Validate: skill is currently disabled
  if (entry.enabled) {
    yield* renderer.info(`Skill '${args.name}' is already enabled`);
    yield* renderer.success("Nothing to do.");
    return;
  }

  // Build operation — operation handles both lock-backed and settings-only paths
  const op = {
    name: "enable-skill",
    args: { skillName: args.name },
  } satisfies EnableSkillOperation;

  // Build and resolve single-step plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Enable skill",
    description: `Enable ${args.name}`,
    label: args.name,
  });

  yield* resolvePlan(bridgeLegacyPlan(plan, { "enable-skill": enableSkill }), {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success("Done");
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleEnable({ name, yes, force, preview })), {
      command: "skills enable",
    }),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a previously disabled skill"),
);
