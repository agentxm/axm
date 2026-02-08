/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * Uses desired-state reconciliation pattern:
 * 1. Create workspace context (local vs global)
 * 2. Ensure workspace is initialized
 * 3. Load current state (actual from disk + locked from lockfile)
 * 4. Build ideal state from command
 * 5. Build plan (diff current vs ideal)
 * 6. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */

import { parseSource, printSource } from "../../../extensions/skills/index.js";
import { discoverSkills } from "./discover-skills.js";
import { determineSkillsToInstall } from "./select-skills.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Clack } from "../../../clack-effect/index.js";
import { SettingsService } from "../../../settings/index.js";
import { formatError } from "../../../utils/errors.js";
import { WorkspaceContextTag as Workspace } from "../../../workspace/index.js";
import type { AddSkillOperation } from "../operations.js";
import { buildPlan } from "./build-plan.js";
import { installSkill } from "./install-skill.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the install command.
 */
export interface InstallHandlerArgs {
  /** Source to install skills from */
  readonly source: string;
  /** Install to global ~/.axm/ instead of local .axm/ */
  readonly global: boolean;
  /** Target agent(s) to install skills for */
  readonly agents: readonly string[];
  /** Specific skill(s) to install (by name) */
  readonly skills: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
  /** List available skills without installing */
  readonly list: boolean;
  /** Install all available skills */
  readonly all: boolean;
  /** Overwrite existing skills */
  readonly force: boolean;
  /** Disable all prompts */
  readonly nonInteractive: Option.Option<boolean>;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error that occurs during skill installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InstallError extends Data.TaggedError("InstallError")<{
  readonly message: string;
  readonly cause: unknown;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills install` command.
 *
 * Flow (state-based architecture):
 * 1. Parse source string to determine type
 * 2. Ensure .axm/ is initialized
 * 3. Detect installed agents (or use --agent flag)
 * 4. Load current state (actual + locked)
 * 5. Discover skills from source
 * 6. List mode (--list stops here)
 * 7. Select skills to install
 * 8. Build ideal state
 * 9. Build plan (diff current vs ideal)
 * 10. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (args: InstallHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  // Scoped to manage temp directory lifecycle from remote git source discovery.
  // The scope keeps the temp clone dir alive until plan application completes.
  return Effect.scoped(
    Effect.gen(function* () {
      const ws = yield* Workspace;
      // Get Clack service
      const clack = yield* Clack;

      // Show intro
      yield* clack.intro(`axm skills install (${scopeLabel})`);

      // Create spinner (auto-detects TTY)
      const spinner = yield* clack.spinner();

      // Step 1: Parse source
      spinner.start("Parsing source...");
      const source = yield* parseSource(args.source).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: formatError(
                `Invalid source: ${error.message}`,
                [`Provided: ${args.source || "(empty)"}`],
                "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
              ),
              cause: error,
              retryable: false,
            }),
        ),
      );
      spinner.stop(`Source: ${printSource(source)} (${source.source})`);

      // Step 2: Get workspace context (provided by runtime)

      // TODO: Step 3 — Get agents from settings or --agent flag

      // Step 5: Discover skills from source
      spinner.start("Discovering skills...");
      const discoveredSkills = yield* discoverSkills(source).pipe(
        Effect.tapError(() => Effect.sync(() => spinner.stop("Failed"))),
      );
      if (!Array.isNonEmptyReadonlyArray(discoveredSkills)) {
        spinner.stop("No skills found");
        return yield* new InstallError({
          message: formatError(
            "No skills found in source",
            [`Source: ${printSource(source)}`],
            "Verify the source path contains directories with SKILL.md files.",
          ),
          cause: undefined,
          retryable: false,
        });
      }
      spinner.stop(`Found ${discoveredSkills.length} skill(s)`);

      // Step 6: List mode -> display and exit
      if (args.list) {
        yield* clack.log.info("Available skills:");
        for (const ref of discoveredSkills) {
          const desc = ref.skill.description ? ` - ${ref.skill.description}` : "";
          yield* clack.log.message(`  ${ref.skill.name}${desc}`);
        }
        yield* clack.outro(`${discoveredSkills.length} skill(s) available`);
        return;
      }

      // Step 7: Select skills to install
      const selectedSkills = yield* determineSkillsToInstall(discoveredSkills, {
        requestedSkills: args.skills,
        all: args.all,
        yes: args.yes,
      });

      if (!Array.isNonEmptyReadonlyArray(selectedSkills)) {
        yield* clack.log.warn("No skills selected.");
        yield* clack.outro("Nothing to install.");
        return;
      }

      const ss = yield* SettingsService;
      const agentIds = yield* ss.getAgents();

      const ops = selectedSkills.map(
        (s) =>
          ({
            name: "install-skill",
            args: {
              agents: agentIds,
              force: args.force,
              source,
              ...s,
            },
          }) satisfies AddSkillOperation,
      );

      // Build plan
      const lockfile = yield* ws.getLockfile();
      const plan = buildPlan(
        ops,
        lockfile,
        "Install skill(s)",
        Option.some(`Install skills from ${printSource(source)}`),
      );

      yield* ws.resolvePlan(plan, { "install-skill": installSkill });

      yield* clack.outro("Done");
    }),
  );
};
