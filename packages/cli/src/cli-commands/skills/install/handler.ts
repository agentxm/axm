/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * Uses desired-state reconciliation pattern:
 * 1. Create workspace context (local vs global)
 * 2. Ensure workspace is initialized
 * 3. Load current state (actual from disk + locked from lockfile)
 * 4. Build ideal state from command
 * 5. Build plan (diff current vs ideal)
 * 6. Display plan (dry-run stops here)
 * 7. Apply plan (if not dry-run)
 *
 * See docs/designs/dry-run.md for the reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { AgentConfig } from "../../../agents/index.js";
import { parseSource, printSource, type Source } from "../../../extensions/skills/index.js";
import { discoverSkills, type DiscoveredSkill } from "./discover-skills.js";
import { determineSkillsToInstall } from "./select-skills.js";
import { fetchGitHubTreeHash } from "../../../sources/index.js";
import {
  type AddSkillOperation,
  applyPlan,
  applyStep,
  buildIdealFromOperations,
  buildPlan,
  ensureAgentsConfigured,
  getPlanSummary,
  loadCurrentState,
  type PlanStep,
  planHasChanges,
  updateLockfileForPlan,
  updateSettingsForPlan,
  WorkspaceContextTag,
} from "../../../workspace/index.js";
import { displayPlan } from "../display.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Clack } from "../../../clack-effect/index.js";
import { formatError } from "../../../utils/errors.js";
import { isInteractive } from "../../../utils/tty.js";

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
  readonly agent: readonly string[];
  /** Specific skill(s) to install (by name) */
  readonly skill: readonly string[];
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
  /** Preview installation plan without making changes */
  readonly dryRun: Option.Option<boolean>;
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
  readonly cause: Option.Option<unknown>;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// V2 Dependencies
// -----------------------------------------------------------------------------

/**
 * Build AddSkillOperations from discovered skills.
 * For GitHub sources, fetches git tree hashes from the API.
 */
const buildAddOperations = (
  source: Source,
  skills: readonly DiscoveredSkill[],
  agents: ReadonlyArray<string>,
  force: boolean,
) =>
  Effect.forEach(
    skills,
    (skill) =>
      Effect.gen(function* () {
        let gitTreeHash: Option.Option<string> = Option.none();

        if (source.source === "github") {
          const pathInRepo = Option.match(source.subPath, {
            onNone: () => skill.name,
            onSome: (p) => `${p}/${skill.name}`,
          });

          gitTreeHash = yield* fetchGitHubTreeHash(
            source.owner,
            source.repo,
            Option.getOrElse(source.ref, () => "HEAD"),
            pathInRepo,
          ).pipe(
            Effect.map((h): Option.Option<string> => (h === null ? Option.none() : Option.some(h))),
            Effect.catchAll(() => Effect.succeed<Option.Option<string>>(Option.none())),
          );
        }

        return {
          _tag: "add-skill",
          source,
          agents,
          skill: {
            name: skill.name,
            version: Option.none(),
            gitTreeHash,
          },
          force,
        } satisfies AddSkillOperation;
      }),
    { concurrency: "unbounded" },
  );

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
 * 10. Display plan (dry-run stops here)
 * 11. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (args: InstallHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  // Scoped to manage temp directory lifecycle from remote git source discovery.
  // The scope keeps the temp clone dir alive until plan application completes.
  return Effect.scoped(
    Effect.gen(function* () {
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
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop(`Source: ${printSource(source)} (${source.source})`);

      // Step 2: Get workspace context (provided by runtime)
      const context = yield* WorkspaceContextTag;

      // Step 3: Get agents from settings or --agent flag
      spinner.start("Loading agents...");
      const agents: AgentConfig[] = yield* ensureAgentsConfigured({
        agentFlags: args.agent,
        workspacePath: context.path,
        getSettings: () => context.getSettings(),
        yes: args.yes,
        nonInteractive: Option.getOrElse(args.nonInteractive, () => false),
      }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: error.message,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop(`Using ${agents.length} agent(s)`);

      // Step 4: Load current state (V2)
      spinner.start("Loading current state...");
      const currentState = yield* loadCurrentState(context).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to load current state: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop("Loaded current state");

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
          cause: Option.none(),
          retryable: false,
        });
      }
      spinner.stop(`Found ${discoveredSkills.length} skill(s)`);

      // Step 6: List mode -> display and exit
      if (args.list) {
        yield* clack.log.info("Available skills:");
        for (const skill of discoveredSkills) {
          const desc = skill.description ? ` - ${skill.description}` : "";
          yield* clack.log.message(`  ${skill.name}${desc}`);
        }
        yield* clack.outro(`${discoveredSkills.length} skill(s) available`);
        return;
      }

      // Step 7: Select skills to install
      const selectedSkills = yield* determineSkillsToInstall(discoveredSkills, {
        requestedSkills: args.skill,
        all: args.all,
        // TODO: why is dry-run here? Is it needed?
        dryRun: Option.getOrElse(args.dryRun, () => false),
        yes: args.yes,
      });

      const selectedSkillNames = Array.map(selectedSkills, (s) => s.name);

      if (!Array.isNonEmptyReadonlyArray(selectedSkillNames)) {
        yield* clack.log.warn("No skills selected.");
        yield* clack.outro("Nothing to install.");
        return;
      }

      // Step 8: Build ideal state using operations
      spinner.start("Building installation plan...");

      const agentIds = Array.map(agents, (a) => a.id);
      const ops = yield* buildAddOperations(source, selectedSkills, agentIds, args.force).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to build operations: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );

      const ideal = yield* buildIdealFromOperations(currentState, ops).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to build ideal state: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop("Built installation plan");

      // Step 9: Build plan (V2)
      const plan = buildPlan(currentState, ideal);

      // Step 10: Display plan
      yield* displayPlan(clack, plan, printSource(source));

      // Step 11: Check if there are changes
      if (!planHasChanges(plan)) {
        yield* clack.log.info("Already up to date.");
        yield* clack.outro("No changes needed.");
        return;
      }

      // Step 12: Dry-run stops here
      if (Option.getOrElse(args.dryRun, () => false)) {
        yield* clack.outro("Dry-run complete. No changes made.");
        return;
      }

      // Step 13: Confirm installation (unless --yes or --non-interactive)
      if (!args.yes && !Option.getOrElse(args.nonInteractive, () => false)) {
        if (!isInteractive()) {
          return yield* Effect.fail(
            new InstallError({
              message: formatError(
                "Cannot prompt for confirmation",
                ["stdin is not a TTY"],
                "Use --yes, --all, or --non-interactive to run without prompts.",
              ),
              cause: Option.none(),
              retryable: false,
            }),
          );
        }
        const confirmed = yield* clack.confirm("Apply changes?").pipe(
          Effect.mapError(
            (error) =>
              new InstallError(
                error._tag === "PromptCancelled"
                  ? { message: "Installation cancelled.", cause: Option.none(), retryable: false }
                  : {
                      message: "Failed to prompt for confirmation",
                      cause: Option.some(error),
                      retryable: false,
                    },
              ),
          ),
        );
        if (!confirmed) {
          yield* clack.log.warn("Installation cancelled.");
          return;
        }
      }

      // Step 14: Apply changes (V2)
      const summary = getPlanSummary(plan);
      spinner.start(`Applying ${summary.installed + summary.updated} change(s)...`);

      // Build a name->path map from discovered skills for file operations.
      // The plan stores source info for lockfile/settings, but file operations
      // need the path to each specific skill folder.
      const skillPathMap = new Map(discoveredSkills.map((s) => [s.name, s.path]));

      const applyStepWithSkillPath = (step: PlanStep) => {
        if (step._tag === "InstallSkill" || step._tag === "UpdateSkill") {
          const skillPath = skillPathMap.get(step.skill);
          if (skillPath) {
            const localSource: Source = { source: "local", path: skillPath };
            const localStep = { ...step, source: localSource };
            return applyStep(localStep, { workspacePath: context.path, agents });
          }
        }
        return applyStep(step, { workspacePath: context.path, agents });
      };

      const applyResult = yield* applyPlan(
        plan,
        { dryRun: false },
        {
          applyStep: applyStepWithSkillPath,
          updateLockfile: (planData: { steps: ReadonlyArray<PlanStep> }) =>
            updateLockfileForPlan(context.path, planData),
          updateSettings: (planData: { steps: ReadonlyArray<PlanStep> }) =>
            updateSettingsForPlan(context.path, planData),
        },
      ).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to apply changes: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );

      spinner.stop(`Applied ${applyResult.applied.length} change(s)`);

      // Show results summary
      yield* Effect.forEach(
        applyResult.applied,
        (step) => {
          const agentNames = step.agents.join(", ");
          return clack.log.success(`${step.skill} -> ${agentNames}`);
        },
        { concurrency: 1 },
      );

      if (applyResult.failed.length > 0) {
        yield* Effect.forEach(
          applyResult.failed,
          (failure) => clack.log.error(`${failure.step.skill}: ${failure.error.message}`),
          { concurrency: 1 },
        );
      }

      yield* clack.outro(
        `Successfully installed ${applyResult.summary.installed} skill(s) to ${agents.length} agent(s)`,
      );
    }),
  );
};
